/**
 * generate-variations.ts
 * Sinh nhiều bài đăng khác nhau từ 1 chủ đề bằng AI.
 * - Sinh theo LÔ nhỏ (mỗi lần vài bài) → tránh bị cắt cụt do giới hạn token.
 * - Yêu cầu AI trả MẢNG JSON → tách bài chắc chắn (có fallback nếu AI trả sai định dạng).
 * - KHÔNG ép "ngắn gọn": độ dài/văn phong do system prompt của trợ lý quyết định.
 * Phần thuần (prompt + parse) tách riêng để test; phần gọi AI nhận chatFn tiêm vào.
 */

/** Dựng prompt yêu cầu AI trả `count` bài dưới dạng MẢNG JSON các chuỗi. */
export function buildVariationPrompt(topic: string, count: number): string {
  return [
    `Viết ${count} bài đăng KHÁC NHAU về chủ đề: "${topic}".`,
    `Mỗi bài phải HOÀN CHỈNH, hấp dẫn, đúng văn phong và yêu cầu trong hướng dẫn hệ thống. Có thể dùng emoji.`,
    `Trả về DUY NHẤT một mảng JSON gồm ${count} chuỗi (mỗi chuỗi là nội dung 1 bài hoàn chỉnh).`,
    `Không thêm bất kỳ chữ nào ngoài mảng JSON, không markdown, không đánh số, không tiêu đề.`,
    `Định dạng: ["nội dung bài 1", "nội dung bài 2", ...]`,
  ].join('\n');
}

/** Cố trích mảng JSON các chuỗi từ text (bỏ code-fence, lấy đoạn [...] đầu→cuối). */
function extractJsonArray(text: string): string[] | null {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    // Mảng hợp lệ (kể cả rỗng) là kết quả hợp lệ → không rơi xuống fallback.
    return arr
      .map((x: any) => (typeof x === 'string' ? x : (x && typeof x.content === 'string' ? x.content : '')))
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  } catch { return null; }
}

/** Tách kết quả AI thành mảng bài: ưu tiên JSON; fallback tách theo `---` / dòng trống kép. */
export function parsePosts(raw: string): string[] {
  const text = (raw || '').trim();
  if (!text) return [];
  const json = extractJsonArray(text);
  if (json) return json;
  // Fallback: AI không trả JSON → tách theo --- hoặc dòng trống kép, bỏ số thứ tự đầu dòng.
  return text
    .split(/^\s*---\s*$|\n{2,}/m)
    .map(s => s.trim().replace(/^\d+[.)]\s*/, '').trim())
    .filter(s => s.length > 0);
}

export type ChatFn = (messages: Array<{ role: string; content: string }>) => Promise<string>;

export interface GenerateOptions {
  /** Số bài mỗi lần gọi AI (mặc định 5). Lô nhỏ → mỗi bài đủ token, không bị cắt. */
  batchSize?: number;
}

/**
 * Sinh `count` bài bằng cách gọi AI theo nhiều LÔ nhỏ, gộp + khử trùng lặp.
 * chatFn do caller cung cấp (renderer dùng ipc.ai.chat với maxTokens cao).
 */
export async function generateVariations(
  topic: string, count: number, chatFn: ChatFn, opts: GenerateOptions = {},
): Promise<string[]> {
  const batchSize = Math.max(1, opts.batchSize ?? 5);
  const collected: string[] = [];
  const seen = new Set<string>();
  let emptyStreak = 0;
  let attempts = 0;
  const maxAttempts = Math.ceil(count / batchSize) + 3;   // dư vài lần phòng lô rỗng

  while (collected.length < count && attempts < maxAttempts && emptyStreak < 2) {
    attempts++;
    const need = Math.min(batchSize, count - collected.length);
    const raw = await chatFn([{ role: 'user', content: buildVariationPrompt(topic, need) }]);
    let added = 0;
    for (const p of parsePosts(raw)) {
      const key = p.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push(p.trim());
      added++;
      if (collected.length >= count) break;
    }
    emptyStreak = added === 0 ? emptyStreak + 1 : 0;
  }
  return collected.slice(0, count);
}
