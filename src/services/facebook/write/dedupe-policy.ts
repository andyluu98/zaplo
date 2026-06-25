/**
 * dedupe-policy.ts
 * Chính sách chống trùng cho hành động GHI.
 *
 * QUAN TRỌNG: chỉ dedupe COMMENT (tránh bình luận trùng cùng 1 bài).
 * Bài ĐĂNG (tường/nhóm) KHÔNG dedupe — đăng lại là hành vi cố ý của user
 * (vd đăng cùng nội dung định kỳ). Trước đây dedupe theo target khiến đăng 1 lần
 * vào nhóm/tường là vĩnh viễn bị "bỏ qua" — đó là bug.
 */

import type { WriteActionType, WriteBatchItem } from './facebook-write-types';

/** true nếu loại hành động này cần chống trùng. */
export function shouldDedupe(actionType: WriteActionType): boolean {
  return actionType === 'comment';
}

/** Khóa chống trùng: ưu tiên item.dedupeKey, mặc định = target. */
export function dedupeKeyOf(item: Pick<WriteBatchItem, 'target' | 'dedupeKey'>): string {
  return item.dedupeKey || item.target;
}
