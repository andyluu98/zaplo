/**
 * FacebookLoginHelper.ts
 * Port từ Python _core/_facebookLogin.py
 * Đăng nhập Facebook bằng username/password (+ 2FA optional)
 */

import axios from 'axios';
import * as crypto from 'crypto';
import { FBLoginResult } from './FacebookTypes';
import Logger from '../../utils/Logger';

// Device identifiers MUST be valid hex UUIDs. randStr() uses a base36 charset
// (a–z0–9) which produces non-hex chars (g–z) → Facebook rejects the device
// fingerprint and returns a misleading "invalid username/password". Use hex only.
function hexStr(n: number): string {
  const c = 'abcdef0123456789';
  return Array.from({ length: n }, () => c[Math.floor(Math.random() * 16)]).join('');
}

const FB_AUTH_URL = 'https://b-graph.facebook.com/auth/login';
const REQUEST_TIMEOUT = 20000;

// Android Facebook app headers (như trong Python original)
const AUTH_HEADERS = {
  'Host': 'b-graph.facebook.com',
  'Content-Type': 'application/x-www-form-urlencoded',
  'X-Fb-Connection-Type': 'unknown',
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014) [FBAN/FB4A;FBAV/498.0.0.39.108;FBPN/com.facebook.katana;FBLC/vi_VN;FBBV/634126374;FBCR/Viettel;FBMF/samsung;FBBD/samsung;FBDV/SM-S918B;FBSV/13;FBCA/arm64-v8a:;FBDM/{density=3.0,width=1080,height=2340};FB_FW/1;FBRV/0;]',
  'X-Fb-Connection-Quality': 'EXCELLENT',
  'Authorization': 'OAuth null',
  'X-Fb-Friendly-Name': 'authenticate',
  'Accept-Encoding': 'gzip, deflate',
  'X-Fb-Server-Cluster': 'True',
};

function generateDeviceId(): string {
  return `${hexStr(8)}-${hexStr(4)}-${hexStr(4)}-${hexStr(4)}-${hexStr(12)}`;
}

function buildCookieExport(sessionCookies: any[]): string {
  return (sessionCookies || [])
    .filter((c: any) => c?.name && c?.value)
    .map((c: any) => `${c.name}=${c.value}; `)
    .join('');
}

function buildLoginResult(dataJson: any, statusLogin: 1 | 0, cookies?: string[]): FBLoginResult {
  if (statusLogin === 1) {
    return {
      success: {
        setCookies: (cookies || []).join(''),
        accessTokenFB: dataJson?.access_token || '',
        cookiesKeyValueList: dataJson?.session_cookies || [],
      },
    };
  }

  const error = dataJson?.error || {};
  return {
    error: {
      title: error.error_user_title || 'Đăng nhập thất bại',
      description: error.error_user_msg || 'Lỗi không xác định',
      error_subcode: error.error_subcode,
      error_code: error.code,
      fbtrace_id: error.fbtrace_id,
    },
  };
}

async function postLogin(data: Record<string, string>, httpsAgent?: any): Promise<any> {
  try {
    const body = new URLSearchParams(data).toString();
    const response = await axios.post(FB_AUTH_URL, body, {
      headers: AUTH_HEADERS,
      timeout: REQUEST_TIMEOUT,
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    return response.data;
  } catch (err: any) {
    // Trích xuất response body từ Facebook (luôn là JSON dù status 400/401/403...)
    if (err.response?.data) {
      const fbError = err.response.data;
      Logger.warn(`[FacebookLoginHelper] Facebook API error (HTTP ${err.response.status}):`, JSON.stringify(fbError));
      // Facebook trả về { error: { ... } } trong body
      if (fbError.error) {
        return { error: fbError.error };
      }
      // Một số response lỗi khác có cấu trúc khác
      return { error: { error_user_msg: JSON.stringify(fbError), code: err.response.status } };
    }
    Logger.warn(`[FacebookLoginHelper] Network error:`, err.message);
    return { error: { error_user_msg: err.message, code: err.response?.status || -1 } };
  }
}

// ── RFC 6238 TOTP via Node's built-in crypto ─────────────────────────────────
// otplib v13's new major requires a crypto plugin and throws CryptoPluginMissingError;
// we compute TOTP directly with crypto (proven working in plans/reports/fb-login-test.cjs).
function base32Decode(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = (s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function getToken2FA(key2FA: string): string {
  try {
    if (!key2FA) return '';
    const key = base32Decode(key2FA.replace(/\s/g, ''));
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const h = crypto.createHmac('sha1', key).update(buf).digest();
    const o = h[h.length - 1] & 0xf;
    const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  } catch (err: any) {
    Logger.warn(`[FacebookLoginHelper] 2FA token error: ${err.message}`);
    return '';
  }
}

/**
 * Đăng nhập Facebook bằng username/password
 * username: SĐT, email hoặc Facebook ID
 * password: Mật khẩu
 * twoFASecret: Chuỗi 16 ký tự từ Facebook 2FA setup (optional)
 */
export async function loginWithCredentials(
  username: string,
  password: string,
  twoFASecret?: string,
  httpsAgent?: any
): Promise<FBLoginResult> {
  const deviceId = generateDeviceId();
  const machineId = hexStr(24);
  const adId = deviceId;

  const baseForm = (pw: string, credentialsType: string, tryNum: number): Record<string, string> => {
    // Fields mirror the proven-working probe (plans/reports/fb-login-test.cjs).
    // jazoest is intentionally omitted — a hardcoded value is rejected by FB.
    const form: Record<string, string> = {
      adid: adId,
      format: 'json',
      device_id: deviceId,
      email: username,
      password: pw,
      generate_analytics_claim: '1',
      community_id: '',
      cpl: 'true',
      try_num: String(tryNum),
      family_device_id: deviceId,
      secure_family_device_id: deviceId,
      credentials_type: credentialsType,
      enroll_misauth: 'false',
      generate_session_cookies: '1',
      error_detail_type: 'button_with_disabled',
      source: 'login',
      machine_id: machineId,
      advertiser_id: adId,
      currently_logged_in_userid: '0',
      locale: 'vi_VN',
      client_country_code: 'VN',
      fb_api_req_friendly_name: 'authenticate',
      fb_api_caller_class: 'Fb4aAuthHandler',
      api_key: '882a8490361da98702bf97a021ddc14d',
      access_token: '350685531728|62f8ce9f74b12f84c123cc23437a4a32',
    };
    if (credentialsType === 'two_factor') {
      form.sim_serials = '[]';
    }
    return form;
  };

  // Step 1: Login with password
  const dataForm = baseForm(password, 'password', 1);
  const dataJson = await postLogin(dataForm, httpsAgent);
  const error = dataJson?.error;

  // Success on first try
  if (!error) {
    const cookies = buildCookieExport(dataJson?.session_cookies || []);
    return buildLoginResult(dataJson, 1, [cookies]);
  }

  // Not a 2FA challenge — return error
  if (error.error_subcode !== 1348162) {
    return buildLoginResult(dataJson, 0);
  }

  // 2FA required but user didn't provide a secret — return the 2FA error immediately
  // (không thử bước 2 với password rỗng, tránh lỗi 400 ghi đè)
  if (!twoFASecret) {
    return buildLoginResult(dataJson, 0);
  }

  // Step 2: Handle 2FA challenge
  const totpCode = getToken2FA(twoFASecret);
  const dataForm2FA = baseForm(totpCode, 'two_factor', 2);
  const errorData = error.error_data || {};
  dataForm2FA.twofactor_code = totpCode;
  dataForm2FA.userid = String(errorData.uid || '');
  dataForm2FA.first_factor = String(errorData.login_first_factor || '');
  dataForm2FA.auth_token = String(errorData.auth_token || '');

  const pass2FA = await postLogin(dataForm2FA, httpsAgent);
  if (pass2FA?.error) {
    return buildLoginResult(pass2FA, 0);
  }

  const cookies2FA = buildCookieExport(pass2FA?.session_cookies || []);
  return buildLoginResult(pass2FA, 1, [cookies2FA]);
}

