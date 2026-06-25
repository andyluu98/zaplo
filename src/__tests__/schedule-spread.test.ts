import { spreadPosts, datesBetween } from '../services/schedule/spread-posts';

test('datesBetween: liệt kê ngày từ-đến (gồm 2 đầu)', () => {
  expect(datesBetween('2026-07-01', '2026-07-03')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  expect(datesBetween('2026-07-05', '2026-07-05')).toEqual(['2026-07-05']);
});

test('spreadPosts: mỗi ngày perDay slot, postId xoay vòng, time xoay vòng', () => {
  const items = spreadPosts(['p1', 'p2'], ['2026-07-01', '2026-07-02', '2026-07-03'], 2, ['08:00', '14:00']);
  expect(items).toHaveLength(6); // 3 ngày × 2/ngày
  expect(items[0]).toEqual({ postId: 'p1', date: '2026-07-01', time: '08:00' });
  expect(items[1]).toEqual({ postId: 'p2', date: '2026-07-01', time: '14:00' });
  expect(items[2]).toEqual({ postId: 'p1', date: '2026-07-02', time: '08:00' }); // postId tiếp tục xoay
});

test('spreadPosts: rỗng khi không có bài hoặc không có ngày', () => {
  expect(spreadPosts([], ['2026-07-01'], 2, ['08:00'])).toEqual([]);
  expect(spreadPosts(['p1'], [], 2, ['08:00'])).toEqual([]);
});
