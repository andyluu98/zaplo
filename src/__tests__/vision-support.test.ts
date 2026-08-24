import { isVisionModel, extractImageUrls, buildMultimodalContent, VISION_MAX_IMAGES } from '../services/ai/vision-support';

describe('vision-support', () => {
  describe('isVisionModel', () => {
    it('true for the deepseek vision model and any -vision suffix', () => {
      expect(isVisionModel('deepseek-v4-flash-vision-exp')).toBe(true);
      expect(isVisionModel('some-future-vision')).toBe(true);
      expect(isVisionModel('DeepSeek-V4-Flash-Vision-Exp')).toBe(true); // case-insensitive
    });
    it('false for non-vision models and empty', () => {
      expect(isVisionModel('deepseek-v4-flash')).toBe(false);
      expect(isVisionModel('deepseek-v4-pro')).toBe(false);
      expect(isVisionModel('')).toBe(false);
    });
  });

  describe('extractImageUrls', () => {
    it('pulls http(s) image URLs from an attachments blob', () => {
      const json = JSON.stringify([
        { type: 'image', url: 'https://cdn.example.com/a.jpg' },
        { type: 'photo', url: 'http://cdn.example.com/b.png' },
      ]);
      expect(extractImageUrls(json)).toEqual(['https://cdn.example.com/a.jpg', 'http://cdn.example.com/b.png']);
    });
    it('drops non-image, local, and over-length URLs', () => {
      const json = JSON.stringify([
        { type: 'image', url: 'file:///local/a.jpg' },          // not http(s)
        { type: 'video', url: 'https://cdn.example.com/v.mp4' }, // https but NOT an image
        { type: 'image', url: 'https://x/' + 'a'.repeat(9000) }, // > 8192
        { type: 'fallback', url: 'https://cdn.example.com/photo.jpeg' }, // image by extension
      ]);
      expect(extractImageUrls(json)).toEqual(['https://cdn.example.com/photo.jpeg']);
    });
    it('returns [] on empty / malformed / non-array input', () => {
      expect(extractImageUrls('')).toEqual([]);
      expect(extractImageUrls(null)).toEqual([]);
      expect(extractImageUrls('not json')).toEqual([]);
      expect(extractImageUrls('{"type":"image"}')).toEqual([]);
    });
  });

  describe('buildMultimodalContent', () => {
    it('text part first, then image_url parts', () => {
      const parts = buildMultimodalContent('gì đây?', ['https://x/a.jpg', 'https://x/b.jpg']);
      expect(parts[0]).toEqual({ type: 'text', text: 'gì đây?' });
      expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'https://x/a.jpg' } });
      expect(parts).toHaveLength(3);
    });
    it('dedupes and caps at VISION_MAX_IMAGES', () => {
      const many = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`);
      const parts = buildMultimodalContent('', [...many, many[0]]);
      // 1 text + VISION_MAX_IMAGES images
      expect(parts).toHaveLength(1 + VISION_MAX_IMAGES);
    });
    it('allows empty text (images carry the question)', () => {
      const parts = buildMultimodalContent('', ['https://x/a.jpg']);
      expect(parts[0]).toEqual({ type: 'text', text: '' });
    });
  });
});
