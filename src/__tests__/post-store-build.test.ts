import { buildPostsFromVariations, randomImageCount } from '../services/post-store/build-posts';

test('randomImageCount nằm trong [min,max]', () => {
  for (let i = 0; i < 50; i++) {
    const n = randomImageCount(1, 3);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  }
  expect(randomImageCount(0, 0)).toBe(0);
  expect(randomImageCount(2, 2)).toBe(2);
});

test('buildPostsFromVariations: mỗi text → 1 post, content giữ nguyên, image_count trong range, title rút gọn', () => {
  const texts = ['Bài một nội dung dài hơn bốn mươi ký tự để kiểm tra việc cắt tiêu đề cho gọn', 'Bài hai'];
  const posts = buildPostsFromVariations(texts, 1, 2);
  expect(posts).toHaveLength(2);
  expect(posts[0].content).toBe(texts[0]);
  expect(posts[0].title.length).toBeLessThanOrEqual(60);
  expect(posts[0].image_count).toBeGreaterThanOrEqual(1);
  expect(posts[0].image_count).toBeLessThanOrEqual(2);
  expect(posts[1].title).toBe('Bài hai');
});

test('buildPostsFromVariations: bỏ text rỗng', () => {
  expect(buildPostsFromVariations(['  ', 'A', ''], 0, 0)).toHaveLength(1);
});
