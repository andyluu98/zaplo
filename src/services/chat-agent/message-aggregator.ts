/**
 * MessageAggregator — gom các mảnh tin theo từng thread (debounce).
 *
 * Khách hỏi ngắt quãng (gõ nhiều tin liên tiếp) → thay vì trả lời từng mảnh,
 * ta gom lại: mỗi thread giữ 1 buffer + 1 timer. Tin mới push vào buffer và
 * RESET timer về `windowMs`. Khi khách im đủ `windowMs`, flush: nối các mảnh
 * bằng '\n' rồi gọi `onFlush(combined)`. Thuần (no DB/Electron) → test bằng
 * jest fake timers.
 */
export const DEBOUNCE_MS = 6000;

type FlushFn = (combined: string) => void;

export class MessageAggregator {
  private buffers = new Map<string, string[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly windowMs: number;

  constructor(windowMs: number = DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  /** Đang có mảnh chờ flush cho thread này? */
  hasPending(key: string): boolean {
    return (this.buffers.get(key)?.length ?? 0) > 0;
  }

  /** Đẩy 1 mảnh vào buffer của thread; reset đồng hồ debounce (latest onFlush thắng). */
  enqueue(key: string, fragment: string, onFlush: FlushFn): void {
    const buf = this.buffers.get(key) ?? [];
    buf.push(fragment);
    this.buffers.set(key, buf);

    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(key, setTimeout(() => this.flush(key, onFlush), this.windowMs));
  }

  /** Hủy timer + buffer cho 1 key, hoặc toàn bộ khi không truyền key (workspace switch). */
  clear(key?: string): void {
    if (key == null) {
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
      this.buffers.clear();
      return;
    }
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
    this.buffers.delete(key);
  }

  private flush(key: string, onFlush: FlushFn): void {
    const buf = this.buffers.get(key) ?? [];
    this.buffers.delete(key);
    this.timers.delete(key);
    const combined = buf.join('\n').trim();
    if (combined) onFlush(combined);
  }
}
