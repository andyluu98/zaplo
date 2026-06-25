/**
 * generate-variations.ts
 * Sinh nhiều bài đăng khác nhau từ 1 chủ đề bằng AI.
 * Phần thuần (prompt + parse) tách riêng để test; phần gọi AI nhận chatFn tiêm vào.
 */

/** Dựng prompt yêu cầu AI trả N bài, mỗi bài cách nhau bằng dòng `---`. */
export function buildVariationPrompt(topic: string, count: number): string {
  return [
    `Viết ${count} bài đăng Facebook KHÁC NHAU về chủ đề: "${topic}".`,
    `Mỗi bài ngắn gọn, hấp dẫn, có thể kèm emoji.`,
    `QUAN TRỌNG: phân tách mỗi bài bằng đúng một dòng chỉ chứa: ---`,
    `Không đánh số, không thêm tiêu đề, chỉ nội dung bài.`,
  ].join('\n');
}

/** Tách kết quả AI thành mảng bài: cắt theo dòng `---`, trim, bỏ rỗng + bỏ số thứ tự đầu dòng. */
export function splitVariations(raw: string): string[] {
  return (raw || '')
    .split(/^\s*---\s*$/m)
    .map(s => s.trim().replace(/^\d+[.)]\s*/, '').trim())
    .filter(s => s.length > 0);
}

export type ChatFn = (messages: Array<{ role: string; content: string }>) => Promise<string>;

/** Gọi AI 1 lần, trả mảng bài (tối đa count). chatFn do caller cung cấp (renderer dùng ipc.ai.chat). */
export async function generateVariations(topic: string, count: number, chatFn: ChatFn): Promise<string[]> {
  const text = await chatFn([{ role: 'user', content: buildVariationPrompt(topic, count) }]);
  const all = splitVariations(text);
  return all.slice(0, count);
}
