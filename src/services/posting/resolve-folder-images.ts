/**
 * resolve-folder-images.ts
 * Chọn ảnh từ 1 thư mục khi đăng. Thuần hàm (không I/O) → dễ test.
 * fixed: lấy `count` ảnh đầu. random: rút ngẫu nhiên min(rand(1..count), len) ảnh không trùng.
 */
import type { ImageAsset } from '../../models/automation';

export function pickFolderImages(
  all: ImageAsset[],
  count: number,
  random: boolean,
  rng: () => number = Math.random,
): ImageAsset[] {
  if (!all?.length || count <= 0) return [];
  const len = all.length;
  if (!random) return all.slice(0, Math.min(count, len));
  // random: chọn số lượng k ∈ [1, min(count,len)], rồi rút k ảnh không trùng
  const cap = Math.min(count, len);
  const k = 1 + Math.floor(rng() * cap);          // 1..cap
  const pool = [...all];
  const out: ImageAsset[] = [];
  while (out.length < k && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
