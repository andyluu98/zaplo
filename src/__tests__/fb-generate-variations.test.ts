import { buildVariationPrompt, parsePosts, generateVariations } from '../services/facebook/write/generate-variations';

test('prompt chứa số lượng + chủ đề + yêu cầu mảng JSON, KHÔNG ép ngắn gọn', () => {
  const p = buildVariationPrompt('khai giảng khóa học', 3);
  expect(p).toContain('3');
  expect(p).toContain('khai giảng khóa học');
  expect(p.toLowerCase()).toContain('json');
  expect(p).not.toContain('ngắn gọn');
});

test('parsePosts: đọc mảng JSON (kể cả khi có code-fence + chữ thừa)', () => {
  expect(parsePosts('["Bài 1", "Bài 2"]')).toEqual(['Bài 1', 'Bài 2']);
  expect(parsePosts('```json\n["A", "B"]\n```')).toEqual(['A', 'B']);
  expect(parsePosts('Đây là kết quả: ["X", "  Y  "] hết.')).toEqual(['X', 'Y']);
});

test('parsePosts: fallback tách theo --- hoặc dòng trống kép khi không phải JSON', () => {
  expect(parsePosts('Bài 1\n---\nBài 2')).toEqual(['Bài 1', 'Bài 2']);
  expect(parsePosts('1. Bài A\n\nBài B')).toEqual(['Bài A', 'Bài B']);
  expect(parsePosts('')).toEqual([]);
});

test('generateVariations: gọi nhiều LÔ, gộp đủ count, khử trùng lặp', async () => {
  const calls: number[] = [];
  // mỗi lô trả 2 bài; lô 2 lặp 1 bài để kiểm tra khử trùng
  let n = 0;
  const chatFn = async () => {
    n++;
    calls.push(n);
    if (n === 1) return '["bài 1", "bài 2"]';
    if (n === 2) return '["bài 2", "bài 3"]'; // "bài 2" trùng → bị bỏ
    return '["bài 4", "bài 5"]';
  };
  const out = await generateVariations('chủ đề', 4, chatFn, { batchSize: 2 });
  expect(out).toEqual(['bài 1', 'bài 2', 'bài 3', 'bài 4']);
  expect(calls.length).toBeGreaterThanOrEqual(3); // phải gọi nhiều lô
});

test('generateVariations: dừng khi lô liên tục rỗng (không lặp vô hạn)', async () => {
  const chatFn = async () => '[]';
  const out = await generateVariations('x', 10, chatFn, { batchSize: 2 });
  expect(out).toEqual([]);
});
