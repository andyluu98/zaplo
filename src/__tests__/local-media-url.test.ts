// src/__tests__/local-media-url.test.ts
import { toLocalMediaUrl } from '../ui/lib/localMedia';

describe('toLocalMediaUrl', () => {
  describe('no width (backward-compatible)', () => {
    it('converts Windows absolute path', () => {
      const url = toLocalMediaUrl('D:/foo/bar.jpg');
      expect(url).toBe('local-media:///D:/foo/bar.jpg');
      expect(url).not.toContain('?w=');
    });

    it('converts relative path', () => {
      const url = toLocalMediaUrl('media/z1/img.jpg');
      expect(url).toBe('local-media:///media/z1/img.jpg');
      expect(url).not.toContain('?w=');
    });

    it('normalizes backslashes', () => {
      const url = toLocalMediaUrl('D:\\foo\\bar.jpg');
      expect(url).toBe('local-media:///D:/foo/bar.jpg');
    });

    it('returns empty string for empty input', () => {
      expect(toLocalMediaUrl('')).toBe('');
    });

    it('passes through existing local-media:// URL unchanged', () => {
      const existing = 'local-media:///D:/foo/bar.jpg';
      expect(toLocalMediaUrl(existing)).toBe(existing);
    });

    it('passes through http:// URL unchanged', () => {
      const url = 'https://example.com/img.jpg';
      expect(toLocalMediaUrl(url)).toBe(url);
    });
  });

  describe('with width param', () => {
    it('appends ?w=240 when width=240', () => {
      const url = toLocalMediaUrl('media/z1/img.jpg', 240);
      expect(url).toBe('local-media:///media/z1/img.jpg?w=240');
    });

    it('appends ?w=96 when width=96', () => {
      const url = toLocalMediaUrl('D:/foo/bar.jpg', 96);
      expect(url).toMatch(/\?w=96$/);
    });

    it('no ?w= when width=0 (falsy guard)', () => {
      const url = toLocalMediaUrl('media/z1/img.jpg', 0);
      expect(url).not.toContain('?w=');
    });

    it('no ?w= when width is undefined', () => {
      const url = toLocalMediaUrl('media/z1/img.jpg', undefined);
      expect(url).not.toContain('?w=');
    });

    it('handles relPath with spaces (encoded by URL constructor downstream)', () => {
      const url = toLocalMediaUrl('media/z1/my image.jpg', 240);
      expect(url).toBe('local-media:///media/z1/my image.jpg?w=240');
    });
  });
});
