import { typingDelayMs, INTER_SEGMENT_DELAY_MS, INTER_IMAGE_DELAY_MS } from '../services/facebook-page/typing-delay';

describe('typing-delay', () => {
  describe('typingDelayMs (deterministic — Zalo path)', () => {
    it('matches the original formula min(max(len*30,800),3000)', () => {
      expect(typingDelayMs('')).toBe(800);           // floor
      expect(typingDelayMs('a'.repeat(10))).toBe(800); // 300 -> floored to 800
      expect(typingDelayMs('a'.repeat(50))).toBe(1500); // 1500
      expect(typingDelayMs('a'.repeat(200))).toBe(3000); // 6000 -> capped
    });
    it('is stable across calls without jitter', () => {
      const s = 'xin chào bạn';
      expect(typingDelayMs(s)).toBe(typingDelayMs(s));
    });
  });

  describe('typingDelayMs (jitter — Page path)', () => {
    it('stays within the [800,3000] clamp', () => {
      for (let i = 0; i < 200; i++) {
        const d = typingDelayMs('a'.repeat(80), true);
        expect(d).toBeGreaterThanOrEqual(800);
        expect(d).toBeLessThanOrEqual(3000);
      }
    });
    it('never exceeds Metas ~20s typing auto-clear', () => {
      expect(typingDelayMs('a'.repeat(10000), true)).toBeLessThan(20000);
    });
  });

  it('exports sane pacing constants', () => {
    expect(INTER_SEGMENT_DELAY_MS).toBe(600);
    expect(INTER_IMAGE_DELAY_MS).toBe(500);
  });
});
