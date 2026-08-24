import { canSendNow, MESSAGING_WINDOW_MS } from '../services/facebook-page/messaging-window';

describe('messaging-window', () => {
  const now = 1_000_000_000_000;

  it('allows sending inside the 24h window', () => {
    expect(canSendNow(now - 1000, now)).toBe(true);
    expect(canSendNow(now - (MESSAGING_WINDOW_MS - 1), now)).toBe(true);
  });

  it('blocks exactly at and past 24h', () => {
    expect(canSendNow(now - MESSAGING_WINDOW_MS, now)).toBe(false);
    expect(canSendNow(now - (MESSAGING_WINDOW_MS + 1), now)).toBe(false);
  });

  it('blocks when there is no customer message on record', () => {
    expect(canSendNow(0, now)).toBe(false);
    expect(canSendNow(null, now)).toBe(false);
    expect(canSendNow(undefined, now)).toBe(false);
  });

  it('the window is 24 hours', () => {
    expect(MESSAGING_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
