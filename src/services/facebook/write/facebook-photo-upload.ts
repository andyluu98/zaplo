/**
 * facebook-photo-upload.ts
 * Upload 1 ảnh lên FB feed → trả photoID (dùng trong story attachments).
 * Endpoint + fields dò ở SPIKE S2 (xem facebook-write-doc-ids.ts). Đã verify chạy thật.
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { FBSessionData } from '../FacebookTypes';
import { FB_PHOTO_UPLOAD_URL } from './facebook-write-doc-ids';
import Logger from '../../../utils/Logger';

/** Rút photoID từ response upload (object/string, có thể có prefix for(;;);). */
export function parsePhotoId(resp: any): string {
  let j = resp;
  if (typeof j === 'string') {
    try { j = JSON.parse(j.replace(/^for\s*\(;;\);/, '').trim()); } catch { return ''; }
  }
  return j?.payload?.photoID ? String(j.payload.photoID) : '';
}

function contentTypeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/** Upload 1 ảnh từ filePath → photoID. Throw nếu fail (caller bắt + log action). */
export async function uploadPhoto(dataFB: FBSessionData, filePath: string, httpsAgent?: any): Promise<string> {
  if (!fs.existsSync(filePath)) throw new Error(`Không tìm thấy ảnh: ${filePath}`);
  // Đọc thành Buffer (KHÔNG dùng createReadStream) — trong Electron, stream khiến
  // form-data không tính đúng Content-Length → FB nhận file rỗng/hỏng.
  let buf = fs.readFileSync(filePath);
  let fname = 'photo' + path.extname(filePath);
  let ctype = contentTypeOf(filePath);

  // FB giới hạn ảnh < 10MB. Ảnh điện thoại thường lớn hơn → tự nén/thu nhỏ qua nativeImage.
  const FB_MAX = 9_500_000;
  if (buf.length > FB_MAX) {
    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(filePath);
      const { width } = img.getSize();
      const targetW = Math.min(width || 2048, 2048);
      let q = 85;
      let out = img.resize({ width: targetW }).toJPEG(q);
      while (out.length > FB_MAX && q > 35) { q -= 15; out = img.resize({ width: targetW }).toJPEG(q); }
      buf = out; fname = 'photo.jpg'; ctype = 'image/jpeg';
      Logger.info(`[fb-photo-upload] resized ảnh lớn → ${buf.length}B (q=${q}, w=${targetW})`);
    } catch (e: any) {
      Logger.warn(`[fb-photo-upload] resize lỗi: ${e?.message} — gửi ảnh gốc (có thể bị FB từ chối nếu >10MB)`);
    }
  }

  const fd = new FormData();
  fd.append('source', '8');
  fd.append('profile_id', dataFB.FacebookID);
  fd.append('waterfallxapp', 'comet');
  fd.append('farr', buf, { filename: fname, contentType: ctype });
  fd.append('av', dataFB.FacebookID);
  fd.append('__user', dataFB.FacebookID);
  fd.append('__a', '1');
  fd.append('fb_dtsg', dataFB.fb_dtsg);
  fd.append('jazoest', dataFB.jazoest);
  if (dataFB.lsd) fd.append('lsd', dataFB.lsd);

  const res = await axios.post(FB_PHOTO_UPLOAD_URL, fd, {
    headers: {
      ...fd.getHeaders(),
      'Cookie': dataFB.cookieFacebook,
      'Origin': 'https://www.facebook.com',
      'Referer': 'https://www.facebook.com/',
      'x-fb-lsd': dataFB.lsd || '',
      'x-asbd-id': '359341',
    },
    timeout: 60000, maxBodyLength: Infinity,
    ...(httpsAgent ? { httpsAgent } : {}),
  });

  const id = parsePhotoId(res.data);
  if (!id) {
    // Bóc lỗi FB thật để chẩn đoán (errorSummary/errorDescription).
    let j: any = res.data;
    if (typeof j === 'string') { try { j = JSON.parse(j.replace(/^for\s*\(;;\);/, '').trim()); } catch {} }
    const fbErr = j?.errorSummary || j?.error?.message || j?.errorDescription || (typeof res.data === 'string' ? res.data.slice(0, 120) : JSON.stringify(j).slice(0, 120));
    const sz = (() => { try { return fs.statSync(filePath).size; } catch { return -1; } })();
    Logger.warn(`[fb-photo-upload] FB từ chối: ${fbErr} | file=${path.basename(filePath)} size=${sz} status=${res.status}`);
    throw new Error(`FB từ chối ảnh: ${fbErr} (file=${path.basename(filePath)}, size=${sz}B)`);
  }
  return id;
}
