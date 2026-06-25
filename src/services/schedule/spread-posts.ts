/**
 * spread-posts.ts
 * Rải bài vào lịch: gán postId vào các ngày × slot/ngày × giờ (xoay vòng). Thuần (dễ test).
 */

export interface SpreadItem { postId: string; date: string; time: string; }

/** Liệt kê ngày 'YYYY-MM-DD' từ-đến (gồm 2 đầu). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Mỗi ngày `perDay` slot; postId xoay vòng liên tục, time xoay vòng theo slot. */
export function spreadPosts(postIds: string[], dates: string[], perDay: number, times: string[]): SpreadItem[] {
  if (!postIds.length || !dates.length) return [];
  const ts = times.length ? times : ['09:00'];
  const out: SpreadItem[] = [];
  let counter = 0;
  for (const date of dates) {
    for (let slot = 0; slot < Math.max(1, perDay); slot++) {
      out.push({ postId: postIds[counter % postIds.length], date, time: ts[slot % ts.length] });
      counter++;
    }
  }
  return out;
}
