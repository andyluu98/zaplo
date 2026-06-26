/**
 * schedule-runner.ts (main process)
 * Chạy nền: định kỳ kiểm item lịch tới hạn → đăng → đánh dấu. Hiện hỗ trợ kênh FB
 * (Zalo lịch để P7). Tái dùng FB write engine + upload ảnh + random ảnh từ thư viện.
 */
import DatabaseService from '../database/DatabaseService';
import { FacebookSendService } from '../facebook/FacebookSendService';
import { initSession } from '../facebook/FacebookSession';
import { sendMutation } from '../facebook/write/facebook-write-service';
import { buildStoryVariables } from '../facebook/write/facebook-write-variables';
import { uploadPhoto } from '../facebook/write/facebook-photo-upload';
import { FB_WRITE_DOC_IDS } from '../facebook/write/facebook-write-doc-ids';
import FileStorageService from '../file/FileStorageService';
import ConnectionManager from '../../utils/ConnectionManager';
import { sendDraftToGroup } from '../posting/posting-sender';
import Logger from '../../utils/Logger';

/** Lấy tối đa n ảnh ngẫu nhiên (rel_path) của 1 account từ thư viện. */
function randomImages(accountId: string, n: number): string[] {
  if (n <= 0) return [];
  const rows = DatabaseService.getInstance().query<any>(
    `SELECT rel_path FROM image_asset WHERE owner_zalo_id=? ORDER BY RANDOM() LIMIT ?`, [accountId, n]);
  return rows.map(r => r.rel_path).filter(Boolean);
}

/** Đăng 1 item lịch (Zalo) — tái dùng posting-sender, KHÔNG sửa engine cũ. */
async function postZaloScheduledItem(item: any): Promise<{ ok: boolean; error?: string }> {
  try {
    const conn = ConnectionManager.getConnection(item.account_id);
    if (!conn?.api) return { ok: false, error: 'Tài khoản Zalo chưa kết nối' };
    const imgPaths = randomImages(item.account_id, item.image_count || 0)
      .map(rel => FileStorageService.resolveAbsolutePath(rel));
    const ok = await sendDraftToGroup(conn.api, {
      zaloId: item.account_id, agentId: null, draftId: 0,
      text: item.content || '', groupId: item.group_id, imagePaths: imgPaths,
    });
    return ok ? { ok: true } : { ok: false, error: 'Gửi nhóm Zalo thất bại' };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

/** Đăng 1 item lịch. Phân nhánh theo kênh. Trả {ok, error?}. */
export async function postScheduledItem(item: any): Promise<{ ok: boolean; error?: string }> {
  if (item.channel === 'zalo') return postZaloScheduledItem(item);
  if (item.channel !== 'fb') return { ok: false, error: 'Kênh không được hỗ trợ.' };
  try {
    const service = await FacebookSendService.getService(item.account_id);
    const base = service.getSessionData();
    let dataFB: any = base;
    try { dataFB = { ...base, ...(await initSession(base.cookieFacebook)), cookieFacebook: base.cookieFacebook }; } catch {}
    const fbId = dataFB.FacebookID;

    // Upload ảnh ngẫu nhiên (nếu post yêu cầu)
    const photoIds: string[] = [];
    for (const rel of randomImages(item.account_id, item.image_count || 0)) {
      try { photoIds.push(await uploadPhoto(dataFB, FileStorageService.resolveAbsolutePath(rel))); }
      catch (e: any) { Logger.warn(`[schedule-runner] upload ảnh lỗi: ${e?.message}`); }
    }

    const doc = FB_WRITE_DOC_IDS.post_group;
    const vars = buildStoryVariables(item.content || '', fbId, { groupId: item.group_id, photoIds });
    const res = await sendMutation(dataFB, { friendlyName: doc.friendlyName, docId: doc.docId || '', variables: vars },
      ['data', 'story_create', 'story', 'id']);
    return res.success ? { ok: true } : { ok: false, error: res.error };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

/** Quét item tới hạn → đăng tuần tự → đánh dấu. */
export async function runDueSchedule(): Promise<{ done: number; failed: number }> {
  const db = DatabaseService.getInstance();
  const due = db.listDueSchedule(Date.now());
  let done = 0, failed = 0;
  for (const it of due) {
    const r = await postScheduledItem(it);
    db.markScheduleItem(it.id, r.ok ? 'done' : 'error', r.error);
    if (r.ok) done++; else failed++;
  }
  return { done, failed };
}

let timer: any = null;
/** Khởi động vòng lặp nền (mỗi 60s). Gọi 1 lần khi app sẵn sàng. */
export function startScheduleRunner(): void {
  if (timer) return;
  timer = setInterval(() => { runDueSchedule().catch(e => Logger.warn(`[schedule-runner] ${e?.message}`)); }, 60_000);
  Logger.log('[schedule-runner] started (60s)');
}
