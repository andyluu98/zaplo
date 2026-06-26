import { parseGroupCsv } from '../services/facebook/write/parse-group-csv';

test('parseGroupCsv: lấy id+tên, bỏ dòng lỗi, dedupe theo id', () => {
  const csv = [
    'link,ten',                                            // header (bỏ vì cột 1 không phải id)
    'https://facebook.com/groups/123, Nhóm A',
    '456, Nhóm B',
    '123, Nhóm A trùng',                                   // trùng id 123 → bỏ
    'không-phải-id, Nhóm lỗi',                              // bỏ
  ].join('\n');
  const out = parseGroupCsv(csv);
  expect(out).toEqual([
    { id: '123', name: 'Nhóm A' },
    { id: '456', name: 'Nhóm B' },
  ]);
});

test('parseGroupCsv: hỗ trợ tab + thiếu tên → tên = id', () => {
  const out = parseGroupCsv('789\tNhóm C\n111');
  expect(out).toEqual([{ id: '789', name: 'Nhóm C' }, { id: '111', name: '111' }]);
});

test('parseGroupCsv: rỗng → []', () => {
  expect(parseGroupCsv('')).toEqual([]);
});
