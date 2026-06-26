/**
 * manual-post-sender.ts
 *
 * Đăng bài TAY tới các nhóm Zalo (không qua agent/draft). Tái dùng sendDraftToGroup
 * của posting-sender — KHÔNG sửa engine cũ. Dùng cho tab "Soạn & Đăng" (đăng ngay)
 * và sau này cho bộ lập lịch rải bài Zalo (Phase C).
 */
import DatabaseService from '../database/DatabaseService';
import FileStorageService from '../file/FileStorageService';
import ConnectionManager from '../../utils/ConnectionManager';
import { sendDraftToGroup } from './posting-sender';
import Logger from '../../utils/Logger';

export interface ManualPostArgs {
  zaloId: string;
  text: string;
  groupIds: string[];
  imageAssetIds?: number[];
}
export interface ManualPostResult {
  ok: boolean; sent: number; failed: number; total: number; error?: string;
}

/** Resolve absolute paths của các ảnh trong thư viện (image_asset) theo id. */
export function resolveImagePaths(zaloId: string, imageAssetIds: number[]): string[] {
  if (!imageAssetIds?.length) return [];
  const assets = DatabaseService.getInstance().getImageAssets(zaloId);
  return imageAssetIds
    .map(id => assets.find(a => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map(a => (a.rel_path ? FileStorageService.resolveAbsolutePath(a.rel_path) : null))
    .filter((p): p is string => !!p);
}

/** Đăng 1 nội dung (text + ảnh) tới nhiều nhóm Zalo ngay lập tức. */
export async function postManualToGroups(args: ManualPostArgs): Promise<ManualPostResult> {
  const { zaloId, text, groupIds, imageAssetIds = [] } = args;
  if (!groupIds?.length) return { ok: false, sent: 0, failed: 0, total: 0, error: 'Chưa chọn nhóm' };
  if (!text?.trim() && !imageAssetIds.length) return { ok: false, sent: 0, failed: 0, total: groupIds.length, error: 'Chưa có nội dung' };

  const conn = ConnectionManager.getConnection(zaloId);
  if (!conn?.api) return { ok: false, sent: 0, failed: 0, total: groupIds.length, error: 'Tài khoản Zalo chưa kết nối' };

  const imagePaths = resolveImagePaths(zaloId, imageAssetIds);
  let sent = 0, failed = 0;
  for (const groupId of groupIds) {
    try {
      const ok = await sendDraftToGroup(conn.api, { zaloId, agentId: null, draftId: 0, text, groupId, imagePaths });
      if (ok) sent++; else failed++;
    } catch (e: any) { failed++; Logger.warn(`[manual-post] ${zaloId} group ${groupId}: ${e?.message}`); }
  }
  return { ok: sent > 0, sent, failed, total: groupIds.length };
}
