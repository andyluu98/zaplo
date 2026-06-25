/**
 * facebook-write-rate-limiter.ts
 * Giới hạn an toàn cho hành động GHI Facebook — chống checkpoint/khóa nick.
 *
 * Đếm số hành động theo (accountId, actionType, ngày) DỰA TRÊN fb_action_log (nguồn sự thật),
 * cộng bộ đếm in-memory cho phiên hiện tại. Random delay trước mỗi lần gửi.
 *
 * Giới hạn mặc định = mức "Cân bằng" (≤10 comment, ≤3 bài/ngày). Có thể chỉnh qua setConfig.
 */

import { sleep } from '../FacebookUtils';
import type { RateLimitConfig, WriteActionType } from './facebook-write-types';
import { countToday } from './facebook-action-log-service';

/**
 * Mặc định MỞ RỘNG — user tự set giới hạn & chịu trách nhiệm (theo yêu cầu).
 * Để số cao = gần như không chặn; user chỉnh lại ở tab "Giới hạn an toàn" nếu muốn siết.
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  perDay: { comment: 1000, post_personal: 1000, post_group: 1000, reply_dm: 5000 },
  delayMs: [4000, 9000],
};

let config: RateLimitConfig = DEFAULT_CONFIG;

/** Bộ đếm phiên: key = `${accountId}|${actionType}|${yyyy-mm-dd}` → số đã gửi trong phiên. */
const sessionCounter = new Map<string, number>();

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function counterKey(accountId: string, actionType: WriteActionType): string {
  return `${accountId}|${actionType}|${todayKey()}`;
}

export function setConfig(next: Partial<RateLimitConfig>): void {
  config = {
    perDay: { ...config.perDay, ...(next.perDay || {}) },
    delayMs: next.delayMs || config.delayMs,
  };
}

export function getConfig(): RateLimitConfig {
  return config;
}

/** Tổng đã dùng hôm nay = log DB (đã commit) — bộ đếm phiên chỉ bù khoảng chưa flush. */
export function usedToday(accountId: string, actionType: WriteActionType): number {
  const fromDb = countToday(accountId, actionType);
  const fromSession = sessionCounter.get(counterKey(accountId, actionType)) || 0;
  return Math.max(fromDb, fromSession);
}

export function remainingToday(accountId: string, actionType: WriteActionType): number {
  const limit = config.perDay[actionType] ?? 0;
  return Math.max(0, limit - usedToday(accountId, actionType));
}

/** true nếu còn quota để gửi 1 hành động loại này hôm nay. */
export function canSend(accountId: string, actionType: WriteActionType): boolean {
  return remainingToday(accountId, actionType) > 0;
}

/** Ghi nhận 1 lần gửi thành công vào bộ đếm phiên (DB do action-log lo riêng). */
export function recordSend(accountId: string, actionType: WriteActionType): void {
  const k = counterKey(accountId, actionType);
  sessionCounter.set(k, (sessionCounter.get(k) || 0) + 1);
}

/** Delay ngẫu nhiên trong khoảng cấu hình, gọi TRƯỚC mỗi lần gửi. */
export function randomDelay(): Promise<void> {
  const [min, max] = config.delayMs;
  const ms = min + Math.floor(Math.random() * Math.max(1, max - min));
  return sleep(ms);
}
