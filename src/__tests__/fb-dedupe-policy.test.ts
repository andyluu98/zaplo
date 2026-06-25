import { shouldDedupe, dedupeKeyOf } from '../services/facebook/write/dedupe-policy';

test('chỉ dedupe comment — bài đăng KHÔNG dedupe (được đăng lại)', () => {
  expect(shouldDedupe('comment')).toBe(true);
  expect(shouldDedupe('post_personal')).toBe(false);
  expect(shouldDedupe('post_group')).toBe(false);
  expect(shouldDedupe('reply_dm')).toBe(false);
});

test('dedupeKeyOf: comment = target; ưu tiên dedupeKey nếu có', () => {
  expect(dedupeKeyOf({ actionType: 'comment', target: 'fb123', content: 'x' } as any)).toBe('fb123');
  expect(dedupeKeyOf({ actionType: 'comment', target: 'fb123', content: 'x', dedupeKey: 'k' } as any)).toBe('k');
});
