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
  /** Keys whose turn must flush even if the combined text is empty (image-only). */
  private forced = new Set<string>();
  private readonly windowMs: number;

  constructor(windowMs: number = DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  /** Đang có mảnh chờ flush cho thread này? */
  hasPending(key: string): boolean {
    return (this.buffers.get(key)?.length ?? 0) > 0;
  }

  /**
   * Đẩy 1 mảnh vào buffer của thread; reset đồng hồ debounce (latest onFlush thắng).
   * `force`: flush ngay cả khi text rỗng — dùng cho tin CHỈ có ảnh (không caption),
   * ảnh được đọc từ history. Mặc định false → giữ nguyên hành vi cũ (whitespace-only
   * không flush).
   */
  enqueue(key: string, fragment: string, onFlush: FlushFn, force = false): void {
    const buf = this.buffers.get(key) ?? [];
    buf.push(fragment);
    this.buffers.set(key, buf);
    if (force) this.forced.add(key);

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
      this.forced.clear();
      return;
    }
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
    this.buffers.delete(key);
    this.forced.delete(key);
  }

  private flush(key: string, onFlush: FlushFn): void {
    const buf = this.buffers.get(key) ?? [];
    const forced = this.forced.has(key);
    this.buffers.delete(key);
    this.timers.delete(key);
    this.forced.delete(key);
    const combined = buf.join('\n').trim();
    // Whitespace-only text never flushes (sticker/noise) — UNLESS this turn was
    // forced (a caption-less image), which must still get a reply.
    if (combined || forced) onFlush(combined);
  }
}
