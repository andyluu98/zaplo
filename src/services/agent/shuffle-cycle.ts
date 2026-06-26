/**
 * shuffle-cycle.ts
 * Xáo-cycle: xáo trộn hết pool → trả lần lượt → hết thì xáo lại (phủ đều, lặp vô hạn).
 * nextInCycle thuần với state cho sẵn; chỉ dùng random khi xáo (createCycle / reshuffle).
 */
export interface Cycle { ids: string[]; order: number[]; pos: number; }

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createCycle(ids: string[]): Cycle {
  return { ids: [...ids], order: shuffle(ids.length), pos: 0 };
}

/** Lấy phần tử kế tiếp; hết pool → xáo lại. Trả id (null nếu pool rỗng) + cycle mới. */
export function nextInCycle(c: Cycle): { id: string | null; cycle: Cycle } {
  if (!c.ids.length) return { id: null, cycle: c };
  let { order, pos } = c;
  if (pos >= order.length) { order = shuffle(c.ids.length); pos = 0; }
  const id = c.ids[order[pos]];
  return { id, cycle: { ids: c.ids, order, pos: pos + 1 } };
}
