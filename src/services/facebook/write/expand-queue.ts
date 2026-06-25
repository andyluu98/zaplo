/**
 * expand-queue.ts
 * Bung danh sách "bài nháp × đích" thành các WriteBatchItem để gửi.
 * Thuần (không side-effect) → dễ test. Lõi giải quyết "1 bài nhiều nhóm" + "nhiều bài".
 */

import type { WriteBatchItem } from './facebook-write-types';

export type Draft = { content: string; imagePaths?: string[] };
export type Target = { kind: 'wall' | 'group'; id: string; name: string };
export type ExpandedItem = WriteBatchItem & { imagePaths?: string[] };

/** Mỗi (bài có nội dung × đích) → 1 item. Bỏ bài rỗng; không đích → rỗng. */
export function expandQueue(drafts: Draft[], targets: Target[]): ExpandedItem[] {
  const out: ExpandedItem[] = [];
  for (const d of drafts) {
    const content = (d.content || '').trim();
    if (!content) continue;
    for (const t of targets) {
      out.push({
        actionType: t.kind === 'group' ? 'post_group' : 'post_personal',
        target: t.kind === 'group' ? t.id : '',
        content,
        label: t.name,
        imagePaths: d.imagePaths || [],
      });
    }
  }
  return out;
}
