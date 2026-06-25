/**
 * facebook-group-service.ts
 * Quản lý nhóm FB đã lưu (chọn theo tên khi đăng). Lưu tay + (sau) auto-fetch.
 */

import DatabaseService from '../../database/DatabaseService';
import { parseGroupId } from './parse-group-id';

export interface SavedGroup { account_id: string; group_id: string; name: string; source: string; created_at: number; }

/** Lưu nhóm thủ công từ link/id + tên. Trả lỗi nếu không lấy được id số. */
export function saveManual(accountId: string, linkOrId: string, name: string): { ok: boolean; error?: string; id?: string } {
  const id = parseGroupId(linkOrId);
  if (!id) return { ok: false, error: 'Cần ID nhóm dạng số hoặc link facebook.com/groups/<id>.' };
  DatabaseService.getInstance().saveFbGroup({
    account_id: accountId, group_id: id, name: (name || '').trim() || id, source: 'manual',
  });
  return { ok: true, id };
}

export function listSaved(accountId: string): SavedGroup[] {
  return DatabaseService.getInstance().listFbGroups(accountId) as SavedGroup[];
}

export function remove(accountId: string, groupId: string): void {
  DatabaseService.getInstance().deleteFbGroup(accountId, groupId);
}
