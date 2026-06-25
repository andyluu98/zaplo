/**
 * FacebookSession.ts
 * Port từ Python _core/_session.py
 * Khởi tạo Facebook session từ cookie — parse fb_dtsg, jazoest, FacebookID, etc.
 */

import axios from 'axios';
import { FBSessionData } from './FacebookTypes';
import { dataSplit } from './FacebookUtils';
import Logger from '../../utils/Logger';

const FB_HOME_URL = 'https://www.facebook.com/';

// Parse order: [name, startDelimiter, endDelimiter]
const SESSION_FIELDS: [keyof FBSessionData, string, string][] = [
  ['fb_dtsg',         'DTSGInitialData",[],{"token":"', '"'],
  ['fb_dtsg_ag',      'async_get_token":"',              '"'],
  ['jazoest',         'jazoest=',                        '"'],
  ['hash',            'hash":"',                         '"'],
  ['sessionID',       'sessionId":"',                    '"'],
  ['FacebookID',      '"actorID":"',                     '"'],
  ['clientRevision',  'client_revision":',               ','],
  ['lsd',             '"LSD",[],{"token":"',             '"'],
];

/**
 * Full browser-like headers cho Facebook requests
 */
export function fbHeaders(cookie: string): Record<string, string> {
  return {
    'authority': 'www.facebook.com',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5',
    'cache-control': 'max-age=0',
    'cookie': cookie,
    'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  };
}

/**
 * Fetch Facebook homepage HTML với đầy đủ headers
 */
export async function fetchFBHomepage(cookie: string, httpsAgent?: any): Promise<string> {
  const response = await axios.get(FB_HOME_URL, {
    headers: fbHeaders(cookie),
    withCredentials: false,
    timeout: 60000,
    ...(httpsAgent ? { httpsAgent } : {}),
  });
  return response.data as string;
}

/**
 * Khởi tạo session từ cookie string
 * Trả về FBSessionData với tất cả thông tin cần thiết cho mọi request
 */
export async function initSession(cookie: string, httpsAgent?: any): Promise<FBSessionData> {
  const html = await fetchFBHomepage(cookie, httpsAgent);
  const result: Partial<FBSessionData> = {};

  for (const [name, start, end] of SESSION_FIELDS) {
    try {
      result[name] = dataSplit(html, start, end);
    } catch {
      result[name] = `[Unable to parse ${name}]` as any;
    }
  }

  result.cookieFacebook = cookie;
  return result as FBSessionData;
}

/**
 * Kiểm tra cookie có còn sống không
 * Cookie alive = có parse được FacebookID từ homepage
 */
export async function checkCookieAlive(cookie: string, httpsAgent?: any): Promise<boolean> {
  try {
    const data = await initSession(cookie, httpsAgent);
    const fbId = data.FacebookID;
    if (!fbId || fbId.includes('Unable to parse') || !fbId.match(/^\d+$/)) {
      return false;
    }
    return true;
  } catch (err: any) {
    Logger.warn(`[FacebookSession] checkCookieAlive error: ${err.message}`);
    return false;
  }
}

/**
 * Decode HTML entities và Unicode escapes
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return text
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Lấy tên và avatar từ Facebook homepage HTML
 * - Avatar: parse từ thẻ <image xlink:href="..."> trong homepage
 * - Tên: parse từ "NAME":"..." trong homepage HTML
 * @param html  HTML trả về từ facebook.com homepage (cần Accept header đúng)
 */
export async function fetchBasicProfileFromHome(html: string): Promise<{ name: string; avatarUrl: string }> {
  let name = '';
  let avatarUrl = '';

  // ── Avatar: parse từ thẻ <image xlink:href="..."> trong homepage ──────
  try {
    const imgMatch = html.match(/xlink:href="(https:\/\/scontent[^"]+)"/);
    if (imgMatch?.[1]) {
      avatarUrl = decodeHtmlEntities(imgMatch[1]);
    }
  } catch {}

  // Fallback: profile_pic_uri trong JSON
  if (!avatarUrl) {
    try {
      const picMatch = html.match(/"profile_pic_uri":"([^"]+)"/);
      if (picMatch?.[1]) {
        avatarUrl = picMatch[1].replace(/\\\//g, '/');
      }
    } catch {}
  }

  // ── Tên: "NAME":"<display name>" từ homepage HTML ─────────────────────
  try {
    const nameMatch = html.match(/"NAME":"(.*?)"/);
    if (nameMatch?.[1] && !nameMatch[1].match(/^\d+$/) && nameMatch[1].length < 100) {
      name = decodeHtmlEntities(nameMatch[1]);
    }
  } catch {}

  // Fallback: "SHORT_NAME"
  if (!name) {
    try {
      const shortMatch = html.match(/"SHORT_NAME":"(.*?)"/);
      if (shortMatch?.[1] && !shortMatch[1].match(/^\d+$/) && shortMatch[1].length < 100) {
        name = decodeHtmlEntities(shortMatch[1]);
      }
    } catch {}
  }

  return { name, avatarUrl };
}

/**
 * Fetch avatar URL cho 1 user Facebook cụ thể bằng cách scrape profile page.
 * Không phụ thuộc vào GraphQL hay cache — luôn trả về URL CDN fresh.
 *
 * Chiến lược:
 *   1. www.facebook.com/profile.php?id={userId} — parse xlink:href hoặc profile_pic_uri
 *   2. Fallback: mbasic.facebook.com/{userId} — HTML nhẹ, parse <img src>
 */
export async function fetchUserAvatarFromProfile(cookie: string, userId: string, httpsAgent?: any): Promise<string | null> {
  // Dùng getUserInfoFacebookHtml để tái sử dụng logic fetch + parse
  const info = await getUserInfoFacebookHtml(cookie, userId, httpsAgent);
  return info?.avatarUrl || null;
}

/**
 * Fetch thông tin user Facebook (tên + avatar) từ profile page HTML.
 * Dùng cho E2EE / hội thoại mới không có contact info.
 * - Avatar: parse <image style="height:168px;width:168px"> xlink:href
 * - Tên: parse <h1> → <div role="button"> → text content
 */
export async function getUserInfoFacebookHtml(cookie: string, userId: string, httpsAgent?: any): Promise<{ name: string; avatarUrl: string } | null> {
  try {
    const response = await axios.get(`https://www.facebook.com/${userId}`, {
      headers: { ...fbHeaders(cookie), 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 30000,
      maxRedirects: 5,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    const html = response.data as string;

    let name = '';
    let avatarUrl = '';

    // ── Avatar: <image style="height:168px;width:168px"> xlink:href ────────
    const imgTagRe = /<image[^>]*style="[^"]*height:\s*168px[^"]*width:\s*168px[^"]*"[^>]*>/i;
    const imgTagMatch = html.match(imgTagRe);
    if (imgTagMatch) {
      const hrefMatch = imgTagMatch[0].match(/xlink:href="(https:\/\/[^"]+)"/);
      if (hrefMatch?.[1]) avatarUrl = decodeHtmlEntities(hrefMatch[1]);
    }

    // Fallback avatar: collect all xlink:href → last
    if (!avatarUrl) {
      const allXlink: string[] = [];
      const xlinkRe = /xlink:href="(https:\/\/[^"]*scontent[^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = xlinkRe.exec(html)) !== null) {
        allXlink.push(m[1]);
      }
      if (allXlink.length > 0) avatarUrl = decodeHtmlEntities(allXlink[allXlink.length - 1]);
    }

    // Fallback avatar: profile_pic_uri
    if (!avatarUrl) {
      const picMatch = html.match(/"profile_pic_uri":"([^"]+)"/);
      if (picMatch?.[1]) avatarUrl = picMatch[1].replace(/\\\//g, '/');
    }

    // ── Tên: <h1> → <div role="button" tabindex="0"> text content ─────
    const h1Match = html.match(/<h1[^>]*>[\s\S]*?<div[^>]*role="button"[^>]*>([^<&]+)/);
    if (h1Match?.[1]) {
      name = h1Match[1].trim();
    }

    // Fallback tên: "NAME":"..." trong JSON
    if (!name) {
      const nameMatch = html.match(/"NAME":"(.*?)"/);
      if (nameMatch?.[1] && !nameMatch[1].match(/^\d+$/) && nameMatch[1].length < 100) {
        name = decodeHtmlEntities(nameMatch[1]);
      }
    }

    // ── Fallback CDN + mbasic cho avatar nếu www không có ────────
    if (!avatarUrl) {
      const cdnUrl = await tryFetchCdnRedirect(cookie, userId, httpsAgent);
      if (cdnUrl) avatarUrl = cdnUrl;
    }
    if (!avatarUrl) {
      const mbasicUrl = await tryFetchMbasic(cookie, userId, httpsAgent);
      if (mbasicUrl) avatarUrl = mbasicUrl;
    }

    if (!name && !avatarUrl) return null;
    return { name, avatarUrl: avatarUrl || '' };
  } catch (err: any) {
    Logger.debug(`[FacebookSession] getUserInfoFacebookHtml failed for ${userId}: ${err.message}`);
  }
  return null;
}

/**
 * Facebook /picture endpoint redirects directly to the CDN URL.
 * Dùng HEAD request để follow redirects mà không download image body.
 * KHÔNG BAO GIỜ nhầm avatar vì Facebook tự xác định ảnh đúng.
 */
async function tryFetchCdnRedirect(cookie: string, userId: string, httpsAgent?: any): Promise<string | null> {
  // Dùng maxRedirects:0 để bắt redirect, đọc Location header
  // HEAD request → không download image body
  try {
    const response = await axios.head(`https://www.facebook.com/${userId}/picture?type=large`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'cookie': cookie,
      },
      timeout: 15000,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    // Nếu không redirect (200 OK), thử request URL
    const reqUrl = response.request?.res?.responseUrl || (response.request as any)?.responseUrl || '';
    if (reqUrl.includes('fbcdn') || reqUrl.includes('scontent')) return reqUrl;
    // redirect URL trong Location header
    if (response.headers?.location) return response.headers.location;
  } catch (err: any) {
    // Khi maxRedirects=0, axios throw error với redirect info
    if (err.response?.headers?.location) {
      return err.response.headers.location;
    }
    Logger.debug(`[FacebookSession] tryFetchCdnRedirect failed for ${userId}: ${err.message}`);
  }

  // Fallback: GET request với maxRedirects=5 để axios tự follow
  try {
    const response = await axios.head(`https://www.facebook.com/${userId}/picture?type=large`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'cookie': cookie,
      },
      timeout: 15000,
      maxRedirects: 5,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    const finalUrl = response.request?.res?.responseUrl || (response.request as any)?.responseUrl || '';
    if (finalUrl.includes('fbcdn') || finalUrl.includes('scontent')) return finalUrl;
  } catch (err: any) {
    Logger.debug(`[FacebookSession] tryFetchCdnRedirect fallback failed for ${userId}: ${err.message}`);
  }
  return null;
}

async function tryFetchWww(cookie: string, userId: string, httpsAgent?: any): Promise<string | null> {
  try {
    const response = await axios.get(`https://www.facebook.com/${userId}`, {
      headers: { ...fbHeaders(cookie), 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 30000,
      maxRedirects: 5,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    const html = response.data as string;

    // Priority 1: <image style="height:168px;width:168px"> — profile picture circle
    // Facebook dùng 168px là kích thước cố định cho profile picture thumbnail
    // Match cả thẻ <image> có style 168px, rồi extract xlink:href
    const imgTagRe = /<image[^>]*style="[^"]*height:\s*168px[^"]*width:\s*168px[^"]*"[^>]*>/i;
    const imgTagMatch = html.match(imgTagRe);
    if (imgTagMatch) {
      const hrefMatch = imgTagMatch[0].match(/xlink:href="(https:\/\/[^"]+)"/);
      if (hrefMatch?.[1]) return decodeHtmlEntities(hrefMatch[1]);
    }

    // Priority 2: Collect ALL xlink:href → return LAST one
    const allXlink: string[] = [];
    const xlinkRe = /xlink:href="(https:\/\/[^"]*scontent[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = xlinkRe.exec(html)) !== null) {
      allXlink.push(m[1]);
    }
    if (allXlink.length > 0) {
      return decodeHtmlEntities(allXlink[allXlink.length - 1]);
    }

    // Priority 3: profile_pic_uri trong JSON inline
    const picMatch = html.match(/"profile_pic_uri":"([^"]+)"/);
    if (picMatch?.[1]) {
      return picMatch[1].replace(/\\\//g, '/');
    }
  } catch (err: any) {
    Logger.debug(`[FacebookSession] tryFetchWww failed for ${userId}: ${err.message}`);
  }
  return null;
}

async function tryFetchMbasic(cookie: string, userId: string, httpsAgent?: any): Promise<string | null> {
  try {
    const response = await axios.get(`https://mbasic.facebook.com/${userId}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'cookie': cookie,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    const html = response.data as string;

    const imgMatch = html.match(/<img[^>]*src="([^"]*scontent[^"]+)"[^>]*>/);
    if (imgMatch?.[1]) return decodeHtmlEntities(imgMatch[1]);

    const xlinkMatch = html.match(/xlink:href="(https:\/\/[^"]*scontent[^"]+)"/);
    if (xlinkMatch?.[1]) return decodeHtmlEntities(xlinkMatch[1]);
  } catch (err: any) {
    Logger.debug(`[FacebookSession] tryFetchMbasic failed for ${userId}: ${err.message}`);
  }
  return null;
}

