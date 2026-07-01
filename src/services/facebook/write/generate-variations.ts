/**
 * generate-variations.ts
 * Sinh nhiều bài đăng khác nhau từ 1 chủ đề bằng AI.
 * MỖI BÀI = 1 lần gọi AI riêng → mỗi bài trọn token (dài & khác nhau).
 * Trước đây gộp 5 bài/1 call + ép JSON array + chia chung 2000 token → bài bị cắt cụt.
 * Phần thuần (buildSinglePostPrompt) tách riêng để test; phần gọi AI nhận chatFn tiêm vào.
 */

export type ChatFn = (messages: Array<{ role: string; content: string }>) => Promise<string>;

export interface GenerateOptions {
  /** Gọi sau mỗi bài xong (done từ 1..total). Dùng để vẽ thanh tiến trình. */
  onProgress?: (done: number, total: number) => void;
  /** Cho phép hủy: khi aborted=true, dừng vòng lặp và trả những bài đã có. */
  signal?: { aborted: boolean };
}

/**
 * Prompt sinh 1 BÀI HOÀN CHỈNH (không ép định dạng cấu trúc, không đánh số).
 * index/total để gợi mỗi bài 1 góc nhìn khác nhau, tránh trùng lặp.
 */
export function buildSinglePostPrompt(topic: string, index: number, total: number): string {
  return [
    `Viết 1 bài đăng HOÀN CHỈNH về chủ đề: "${topic}".`,
    `Đây là bài số ${index + 1} trong bộ ${total} bài — hãy chọn MỘT góc nhìn KHÁC với các bài còn lại (ví dụ: lợi ích, câu chuyện thực tế, mẹo, so sánh, lời kêu gọi hành động...).`,
    `Bài phải dài đủ ý, giọng tự nhiên, hấp dẫn, đúng văn phong và yêu cầu trong hướng dẫn hệ thống. Có thể dùng emoji.`,
    `CHỈ trả về nội dung bài đăng. KHÔNG đánh số, KHÔNG tiêu đề "Bài 1", KHÔNG giải thích, KHÔNG markdown code-fence.`,
  ].join('\n');
}

/** Gọi AI 1 lần cho 1 bài, trả nội dung đã trim (rỗng nếu AI trả trống). */
async function generateOne(topic: string, index: number, total: number, chatFn: ChatFn): Promise<string> {
  const raw = await chatFn([{ role: 'user', content: buildSinglePostPrompt(topic, index, total) }]);
  return (raw || '').trim();
}

/**
 * Sinh `count` bài: mỗi bài 1 call riêng, tuần tự.
 * - Loại bài rỗng; retry nhẹ ≤1 nếu 1 bài trả rỗng.
 * - onProgress(done,total) sau mỗi bài (kể cả bài bị loại vẫn tính là 1 bước đã xử lý).
 * - signal.aborted → dừng ngay.
 */
export async function generateVariations(
  topic: string, count: number, chatFn: ChatFn, opts: GenerateOptions = {},
): Promise<string[]> {
  const total = Math.max(0, Math.floor(count));
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) break;
    let text = await generateOne(topic, i, total, chatFn);
    if (!text && !opts.signal?.aborted) {
      // retry nhẹ 1 lần cho bài rỗng
      text = await generateOne(topic, i, total, chatFn);
    }
    if (text) out.push(text);
    opts.onProgress?.(i + 1, total);
  }
  return out;
}
