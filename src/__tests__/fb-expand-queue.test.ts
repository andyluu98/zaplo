import { expandQueue } from '../services/facebook/write/expand-queue';

test('bung mỗi (bài × đích) thành 1 item, bỏ đích rỗng', () => {
  const drafts = [{ content: 'A' }, { content: 'B' }];
  const targets = [
    { kind: 'wall' as const, id: '', name: 'Tường' },
    { kind: 'group' as const, id: '123', name: 'Nhóm X' },
  ];
  const out = expandQueue(drafts, targets);
  expect(out).toHaveLength(4);
  expect(out[0]).toMatchObject({ actionType: 'post_personal', target: '', content: 'A', label: 'Tường' });
  expect(out[3]).toMatchObject({ actionType: 'post_group', target: '123', content: 'B', label: 'Nhóm X' });
});

test('bỏ bài rỗng và khi không có đích', () => {
  expect(expandQueue([{ content: ' ' }], [{ kind: 'wall', id: '', name: 'T' }])).toHaveLength(0);
  expect(expandQueue([{ content: 'A' }], [])).toHaveLength(0);
});

test('giữ imageAssetIds theo từng bài', () => {
  const out = expandQueue([{ content: 'A', imageAssetIds: [5, 7] }], [{ kind: 'wall', id: '', name: 'T' }]);
  expect(out[0].imageAssetIds).toEqual([5, 7]);
});
