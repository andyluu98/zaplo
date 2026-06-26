/**
 * build-posts.ts
 * Dựng bài cho Kho bài từ text AI sinh: mỗi text → 1 post + số ảnh ngẫu nhiên trong [min,max].
 * Thuần (dễ test). Random dùng Math.random — chỉ test khoảng giá trị, không test giá trị cố định.
 */

export interface DraftPost { title: string; content: string; image_count: number; }

/** Số nguyên ngẫu nhiên trong [min,max] (bao gồm 2 đầu). min>max → min. */
export function randomImageCount(min: number, max: number): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Rút tiêu đề gọn từ nội dung (dòng đầu, tối đa 60 ký tự). */
function titleOf(content: string): string {
  const first = content.split('\n')[0].trim();
  return first.length > 60 ? first.slice(0, 57) + '…' : first;
}

export function buildPostsFromVariations(texts: string[], imageMin: number, imageMax: number): DraftPost[] {
  return texts
    .map(t => (t || '').trim())
    .filter(t => t.length > 0)
    .map(content => ({ title: titleOf(content), content, image_count: randomImageCount(imageMin, imageMax) }));
}
