/**
 * facebook-write-ipc.ts
 * IPC handlers cho tính năng GHI Facebook (comment, đăng bài, reply DM).
 *
 * Luồng an toàn: previewBatch (kiểm tra trùng + quota) → user duyệt →
 * sendApproved (gửi TUẦN TỰ, delay ngẫu nhiên, dừng khi vượt giới hạn ngày, emit progress).
 *
 * Envelope {success, error, ...data} đồng bộ với postingIpc/chatAgentIpc.
 */

import { ipcMain } from 'electron';
import { FacebookSendService } from '../../src/services/facebook/FacebookSendService';
import { initSession } from '../../src/services/facebook/FacebookSession';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import Logger from '../../src/utils/Logger';
import { sendMutation } from '../../src/services/facebook/write/facebook-write-service';
import { FB_WRITE_DOC_IDS } from '../../src/services/facebook/write/facebook-write-doc-ids';
import * as rateLimiter from '../../src/services/facebook/write/facebook-write-rate-limiter';
import * as actionLog from '../../src/services/facebook/write/facebook-action-log-service';
import * as groupService from '../../src/services/facebook/write/facebook-group-service';
import { buildVariables } from '../../src/services/facebook/write/facebook-write-variables';
import type { WriteActionType, WriteBatchItem, WriteBatchProgress } from '../../src/services/facebook/write/facebook-write-types';

function dedupeKeyOf(item: WriteBatchItem): string {
  return item.dedupeKey || item.target;
}

/** id-path để rút id đối tượng tạo ra theo loại mutation (tinh chỉnh khi SPIKE doc_id). */
const ID_PATH: Partial<Record<WriteActionType, string[]>> = {
  comment: ['data', 'comment_create', 'feedback_comment_edge', 'node', 'id'],
  post_personal: ['data', 'story_create', 'story', 'id'],
  post_group: ['data', 'story_create', 'story', 'id'],
};

export function registerFacebookWriteIpc(): void {

  // ─── Cấu hình giới hạn ────────────────────────────────────────────────────────
  ipcMain.handle('facebook:write:getLimits', async () => {
    try { return { success: true, config: rateLimiter.getConfig() }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('facebook:write:setLimits', async (_e, { config }: { config: any }) => {
    try { rateLimiter.setConfig(config || {}); return { success: true, config: rateLimiter.getConfig() }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  // ─── Preview loạt: đánh dấu trùng + còn quota bao nhiêu ─────────────────────────
  ipcMain.handle('facebook:write:previewBatch', async (_e, { accountId, items }: { accountId: string; items: WriteBatchItem[] }) => {
    try {
      const list = Array.isArray(items) ? items : [];
      const annotated = list.map(it => ({
        ...it,
        duplicate: actionLog.isDuplicate(accountId, it.actionType, dedupeKeyOf(it)),
        hasDocId: !!FB_WRITE_DOC_IDS[it.actionType]?.docId,
      }));
      // Tổng hợp quota còn lại theo loại
      const types = Array.from(new Set(list.map(i => i.actionType))) as WriteActionType[];
      const quota = types.map(t => ({ actionType: t, remaining: rateLimiter.remainingToday(accountId, t), used: rateLimiter.usedToday(accountId, t) }));
      return { success: true, items: annotated, quota };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  // ─── Gửi loạt đã duyệt (tuần tự, có delay, dừng khi hết quota) ───────────────────
  ipcMain.handle('facebook:write:sendApproved', async (_e, { accountId, items }: { accountId: string; items: WriteBatchItem[] }) => {
    const list = Array.isArray(items) ? items : [];
    const progress: WriteBatchProgress = {
      accountId, actionType: list[0]?.actionType || 'comment',
      total: list.length, done: 0, sent: 0, failed: 0, skipped: 0,
    };

    let dataFB: any;
    try {
      const service = await FacebookSendService.getService(accountId);
      const base = service.getSessionData();
      // Refresh fb_dtsg + lsd mới từ homepage (token cũ dễ hết hạn → FB từ chối GHI).
      try {
        const fresh = await initSession(base.cookieFacebook);
        dataFB = { ...base, ...fresh, cookieFacebook: base.cookieFacebook };
      } catch { dataFB = base; }
    } catch (e: any) {
      return { success: false, error: `Tài khoản chưa kết nối: ${e.message}` };
    }
    const fbId = dataFB.FacebookID;

    for (const item of list) {
      const dk = dedupeKeyOf(item);

      // 1. Dedupe
      if (actionLog.isDuplicate(accountId, item.actionType, dk)) {
        progress.skipped++; progress.done++;
        EventBroadcaster.emit('facebook:write:progress', progress);
        continue;
      }
      // 2. Quota ngày
      if (!rateLimiter.canSend(accountId, item.actionType)) {
        progress.stoppedReason = `Đã đạt giới hạn ${item.actionType}/ngày — dừng để an toàn nick.`;
        break;
      }
      // 3. Delay ngẫu nhiên
      await rateLimiter.randomDelay();

      // 4. Gửi
      const docEntry = FB_WRITE_DOC_IDS[item.actionType];
      const result = await sendMutation(
        dataFB,
        { friendlyName: docEntry.friendlyName, docId: docEntry.docId || '', variables: buildVariables(item, fbId) },
        ID_PATH[item.actionType],
      );

      // 5. Log + đếm
      actionLog.record({
        account_id: accountId, action_type: item.actionType, target: item.target,
        status: result.success ? 'success' : 'failed',
        result_id: result.id, error: result.error, dedupe_key: dk,
      });
      if (result.success) { progress.sent++; rateLimiter.recordSend(accountId, item.actionType); }
      else { progress.failed++; Logger.warn(`[facebook-write] gửi thất bại ${item.actionType} → ${item.target}: ${result.error}`); }

      progress.done++;
      EventBroadcaster.emit('facebook:write:progress', progress);
    }

    return { success: true, progress };
  });

  // ─── Lịch sử + thống kê ─────────────────────────────────────────────────────────
  ipcMain.handle('facebook:write:recent', async (_e, { accountId, limit }: { accountId: string; limit?: number }) => {
    try { return { success: true, items: actionLog.recent(accountId, limit || 50) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('facebook:write:statsToday', async (_e, { accountId }: { accountId: string }) => {
    try { return { success: true, stats: actionLog.statsToday(accountId) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  // ─── Quản lý nhóm ───────────────────────────────────────────────────────────────
  ipcMain.handle('facebook:group:list', async (_e, { accountId }: { accountId: string }) => {
    try { return { success: true, groups: groupService.listSaved(accountId) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('facebook:group:saveManual', async (_e, { accountId, linkOrId, name }: { accountId: string; linkOrId: string; name: string }) => {
    try {
      const r = groupService.saveManual(accountId, linkOrId, name);
      return r.ok ? { success: true, id: r.id } : { success: false, error: r.error };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('facebook:group:delete', async (_e, { accountId, groupId }: { accountId: string; groupId: string }) => {
    try { groupService.remove(accountId, groupId); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });
}
