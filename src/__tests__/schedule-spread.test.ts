import { spreadPosts, datesBetween, spreadPostsInWindow } from '../services/schedule/spread-posts';

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

test('spreadPostsInWindow: perDay bài trải đều khung giờ, KHÔNG trùng giờ (rand=0 → đầu mỗi khoảng con)', () => {
  // khung 08:00–12:00 (240 phút), 2 bài → 2 khoảng con [08:00,10:00), [10:00,12:00)
  const items = spreadPostsInWindow(['p1', 'p2'], ['2026-07-01'], 2, '08:00', '12:00', () => 0);
  expect(items).toHaveLength(2);
  expect(items.map(i => i.time)).toEqual(['08:00', '10:00']); // khác giờ nhau
});

test('spreadPostsInWindow: giờ luôn nằm trong khung [start,end]', () => {
  const items = spreadPostsInWindow(['p1'], ['2026-07-01'], 3, '08:00', '11:00', () => 0.999);
  for (const it of items) {
    const m = Number(it.time.slice(0, 2)) * 60 + Number(it.time.slice(3));
    expect(m).toBeGreaterThanOrEqual(8 * 60);
    expect(m).toBeLessThanOrEqual(11 * 60);
  }
  // 3 bài/ngày → 3 mốc khác nhau, tăng dần
  const mins = items.map(i => Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3)));
  expect(mins[0]).toBeLessThan(mins[1]);
  expect(mins[1]).toBeLessThan(mins[2]);
});

test('spreadPostsInWindow: postId xoay vòng qua nhiều ngày', () => {
  const items = spreadPostsInWindow(['p1', 'p2'], ['2026-07-01', '2026-07-02'], 1, '08:00', '08:00', () => 0);
  expect(items).toHaveLength(2);
  expect(items[0].postId).toBe('p1');
  expect(items[1].postId).toBe('p2');
  expect(items.every(i => i.time === '08:00')).toBe(true); // khung 0 phút → đúng giờ start
});
