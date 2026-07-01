import { generateVariations, buildSinglePostPrompt } from '../services/facebook/write/generate-variations';

test('generateVariations: gọi chatFn ĐÚNG count lần (1 bài/call)', async () => {
  let calls = 0;
  const chatFn = async () => { calls++; return `bài số ${calls} nội dung dài đủ ý`; };
  const out = await generateVariations('chủ đề', 5, chatFn);
  expect(calls).toBe(5);
  expect(out).toHaveLength(5);
  expect(out[0]).toContain('bài số 1');
});

test('generateVariations: trim kết quả + loại bài rỗng, retry nhẹ ≤1', async () => {
  // call #2 trả rỗng lần đầu → retry 1 lần ra nội dung
  let n = 0;
  const seq = ['  bài A  ', '', 'bài B (retry)', 'bài C'];
  const chatFn = async () => seq[n++] ?? 'bù';
  const out = await generateVariations('t', 3, chatFn);
  expect(out).toEqual(['bài A', 'bài B (retry)', 'bài C']);
  expect(n).toBe(4); // 3 bài + 1 retry
});

test('generateVariations: bài rỗng bền vững (retry vẫn rỗng → bỏ, không kẹt)', async () => {
  const chatFn = async () => '';
  const out = await generateVariations('t', 3, chatFn);
  expect(out).toEqual([]); // rỗng hết → loại hết, không vòng lặp vô hạn
});

test('generateVariations: onProgress gọi đủ (done tăng 1..total)', async () => {
  const seen: Array<[number, number]> = [];
  const chatFn = async () => 'bài ok';
  await generateVariations('t', 3, chatFn, { onProgress: (d, tot) => seen.push([d, tot]) });
  expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
});

test('generateVariations: signal.aborted dừng sớm', async () => {
  const signal = { aborted: false };
  let calls = 0;
  const chatFn = async () => { calls++; if (calls === 2) signal.aborted = true; return `bài ${calls}`; };
  const out = await generateVariations('t', 10, chatFn, { signal });
  expect(calls).toBe(2);
  expect(out).toHaveLength(2);
});

test('buildSinglePostPrompt: chứa chủ đề + số thứ tự, KHÔNG ép JSON/mảng', () => {
  const p = buildSinglePostPrompt('khai giảng khóa học', 0, 3);
  expect(p).toContain('khai giảng khóa học');
  expect(p).toContain('1'); // bài số index+1
  expect(p).toContain('3'); // trong bộ 3 bài
  expect(p.toLowerCase()).not.toContain('json');
  expect(p.toLowerCase()).not.toContain('mảng');
  expect(p).not.toContain('ngắn gọn');
});
