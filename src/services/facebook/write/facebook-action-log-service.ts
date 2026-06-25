/**
 * facebook-action-log-service.ts
 * Ghi log mọi hành động GHI Facebook vào bảng fb_action_log.
 * Dùng cho: dedupe (chống gửi trùng), đếm rate-limit theo ngày, thống kê UI.
 *
 * BẢO MẬT: KHÔNG bao giờ log fb_dtsg / cookie. Chỉ log id/target/status/error.
 */

import DatabaseService from '../../database/DatabaseService';
import type { WriteActionType } from './facebook-write-types';

export interface ActionLogRow {
  id?: number;
  account_id: string;
  action_type: WriteActionType;
  target: string;
  status: 'success' | 'failed';
  result_id?: string;
  error?: string;
  dedupe_key: string;
  created_at: number;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Ghi 1 dòng log. */
export function record(row: Omit<ActionLogRow, 'id' | 'created_at'> & { created_at?: number }): void {
  const db = DatabaseService.getInstance();
  db.run(
    `INSERT INTO fb_action_log (account_id, action_type, target, status, result_id, error, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.account_id,
      row.action_type,
      row.target,
      row.status,
      row.result_id || null,
      row.error || null,
      row.dedupe_key,
      row.created_at ?? Date.now(),
    ],
  );
  db.save();
}

/** true nếu (account, actionType, dedupeKey) ĐÃ từng gửi THÀNH CÔNG → bỏ qua. */
export function isDuplicate(accountId: string, actionType: WriteActionType, dedupeKey: string): boolean {
  const db = DatabaseService.getInstance();
  const row = db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM fb_action_log
     WHERE account_id=? AND action_type=? AND dedupe_key=? AND status='success'`,
    [accountId, actionType, dedupeKey],
  );
  return (row?.c || 0) > 0;
}

/** Số hành động THÀNH CÔNG hôm nay theo loại (nguồn cho rate-limiter). */
export function countToday(accountId: string, actionType: WriteActionType): number {
  const db = DatabaseService.getInstance();
  const row = db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM fb_action_log
     WHERE account_id=? AND action_type=? AND status='success' AND created_at>=?`,
    [accountId, actionType, startOfTodayMs()],
  );
  return row?.c || 0;
}

/** Thống kê hôm nay: {success, failed} theo loại — cho UI. */
export function statsToday(accountId: string): Array<{ action_type: string; status: string; c: number }> {
  const db = DatabaseService.getInstance();
  return db.query(
    `SELECT action_type, status, COUNT(*) AS c FROM fb_action_log
     WHERE account_id=? AND created_at>=? GROUP BY action_type, status`,
    [accountId, startOfTodayMs()],
  );
}

/** N dòng log gần nhất — cho UI lịch sử. */
export function recent(accountId: string, limit = 50): ActionLogRow[] {
  const db = DatabaseService.getInstance();
  return db.query<ActionLogRow>(
    `SELECT * FROM fb_action_log WHERE account_id=? ORDER BY created_at DESC LIMIT ?`,
    [accountId, limit],
  );
}
