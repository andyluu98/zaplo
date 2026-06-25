import { createCycle, nextInCycle } from '../services/agent/shuffle-cycle';

test('createCycle: order là hoán vị đủ chỉ số', () => {
  const c = createCycle(['a', 'b', 'c']);
  expect([...c.order].sort()).toEqual([0, 1, 2]);
  expect(c.pos).toBe(0);
});

test('nextInCycle: 1 vòng phủ ĐỦ pool (không bỏ sót, không trùng) trước khi lặp', () => {
  let c = createCycle(['a', 'b', 'c']);
  const got: string[] = [];
  for (let i = 0; i < 3; i++) { const r = nextInCycle(c); got.push(r.id); c = r.cycle; }
  expect([...got].sort()).toEqual(['a', 'b', 'c']); // đủ 3, không trùng
});

test('nextInCycle: hết pool thì xáo lại + tiếp tục (lặp vô hạn)', () => {
  let c = createCycle(['a', 'b']);
  const seq: string[] = [];
  for (let i = 0; i < 6; i++) { const r = nextInCycle(c); seq.push(r.id); c = r.cycle; }
  expect(seq).toHaveLength(6);
  expect(seq.filter(x => x === 'a').length).toBe(3); // mỗi bài xuất hiện đều (3 vòng × 1)
  expect(seq.filter(x => x === 'b').length).toBe(3);
});

test('pool 1 phần tử → luôn trả phần tử đó; pool rỗng → null', () => {
  let c = createCycle(['x']);
  const r = nextInCycle(c); expect(r.id).toBe('x');
  expect(nextInCycle(createCycle([])).id).toBeNull();
});
