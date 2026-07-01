import { pickFolderImages } from '../services/posting/resolve-folder-images';
import type { ImageAsset } from '../models/automation';

const mk = (n: number): ImageAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1, owner_zalo_id: 'z', rel_path: `p/${i + 1}.jpg`, origin: 'upload',
  }));

describe('pickFolderImages', () => {
  test('fixed: lấy đúng count ảnh đầu', () => {
    const out = pickFolderImages(mk(5), 3, false);
    expect(out).toHaveLength(3);
    expect(out.map(a => a.id)).toEqual([1, 2, 3]);
  });

  test('fixed: count > len → clamp về len', () => {
    const out = pickFolderImages(mk(2), 5, false);
    expect(out).toHaveLength(2);
  });

  test('folder rỗng → []', () => {
    expect(pickFolderImages([], 3, false)).toEqual([]);
    expect(pickFolderImages([], 3, true)).toEqual([]);
  });

  test('count <= 0 → []', () => {
    expect(pickFolderImages(mk(5), 0, false)).toEqual([]);
    expect(pickFolderImages(mk(5), -1, true)).toEqual([]);
  });

  test('random: kết quả ⊆ folder (mọi phần tử thuộc all)', () => {
    const all = mk(6);
    const ids = new Set(all.map(a => a.id));
    for (let i = 0; i < 30; i++) {
      const out = pickFolderImages(all, 4, true);
      expect(out.every(a => ids.has(a.id))).toBe(true);
    }
  });

  test('random: số lượng ∈ [1, count] (và ≤ len)', () => {
    for (let i = 0; i < 30; i++) {
      const out = pickFolderImages(mk(10), 4, true);
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.length).toBeLessThanOrEqual(4);
    }
  });

  test('random: không trùng lặp phần tử', () => {
    const out = pickFolderImages(mk(8), 8, true, () => 0.42);
    const ids = out.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('random deterministic với rng cố định', () => {
    const all = mk(5);
    const a = pickFolderImages(all, 3, true, () => 0.5);
    const b = pickFolderImages(all, 3, true, () => 0.5);
    expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
  });
});
