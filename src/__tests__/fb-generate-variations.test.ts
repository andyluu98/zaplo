import { buildVariationPrompt, splitVariations } from '../services/facebook/write/generate-variations';

test('prompt chứa số lượng + chủ đề + quy ước phân tách ---', () => {
  const p = buildVariationPrompt('khai giảng khóa học', 3);
  expect(p).toContain('3');
  expect(p).toContain('khai giảng khóa học');
  expect(p).toContain('---');
});

test('splitVariations tách theo ---, bỏ rỗng + trim', () => {
  expect(splitVariations('Bài 1\n---\nBài 2\n---\n   ')).toEqual(['Bài 1', 'Bài 2']);
  expect(splitVariations('  Chỉ một bài  ')).toEqual(['Chỉ một bài']);
  expect(splitVariations('')).toEqual([]);
});

test('splitVariations bỏ số thứ tự đầu dòng kiểu "1." nếu có', () => {
  expect(splitVariations('1. Bài A\n---\n2. Bài B')).toEqual(['Bài A', 'Bài B']);
});
