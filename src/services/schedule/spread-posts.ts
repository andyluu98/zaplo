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

/** "HH:MM" → số phút trong ngày. */
export function hhmmToMin(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Số phút → "HH:MM". */
export function minToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Rải `perDay` bài/ngày vào KHUNG GIỜ [startTime, endTime] với giờ NGẪU NHIÊN nhưng trải đều:
 * chia khung thành perDay khoảng con bằng nhau, mỗi bài lấy 1 giờ ngẫu nhiên trong khoảng con
 * → các bài trong ngày KHÔNG trùng giờ, vẫn ngẫu nhiên. postId xoay vòng liên tục.
 * `rand` tách ra để test xác định (mặc định Math.random).
 */
export function spreadPostsInWindow(
  postIds: string[], dates: string[], perDay: number,
  startTime: string, endTime: string,
  rand: () => number = Math.random,
): SpreadItem[] {
  if (!postIds.length || !dates.length) return [];
  const n = Math.max(1, perDay);
  let s = hhmmToMin(startTime);
  let e = hhmmToMin(endTime);
  if (e < s) { const tmp = s; s = e; e = tmp; }   // hoán nếu nhập ngược
  const span = e - s;
  const out: SpreadItem[] = [];
  let counter = 0;
  for (const date of dates) {
    const mins: number[] = [];
    for (let slot = 0; slot < n; slot++) {
      const subStart = s + (span * slot) / n;
      const subEnd = s + (span * (slot + 1)) / n;
      mins.push(span === 0 ? s : subStart + rand() * (subEnd - subStart));
    }
    mins.sort((a, b) => a - b);
    for (const t of mins) {
      out.push({ postId: postIds[counter % postIds.length], date, time: minToHHMM(t) });
      counter++;
    }
  }
  return out;
}
