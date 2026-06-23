/**
 * TDD — auto-resume decision (pure).
 * A conversation auto-paused because a human typed should hand back to the AI after
 * `autoresumeMinutes` of silence. Manual off (reason='manual') is NOT auto-resumed.
 */
import { shouldAutoResume, PauseState } from '../services/chat-agent/chat-agent-decider';

const NOW = 1_000_000_000_000;
const state = (over: Partial<PauseState>): PauseState => ({ paused: 1, paused_reason: 'human', paused_at: NOW, ...over });

describe('shouldAutoResume', () => {
  test('human pause older than threshold → resume', () => {
    expect(shouldAutoResume(state({ paused_at: NOW - 31 * 60000 }), 30, NOW)).toBe(true);
  });
  test('human pause within threshold → keep paused', () => {
    expect(shouldAutoResume(state({ paused_at: NOW - 10 * 60000 }), 30, NOW)).toBe(false);
  });
  test('autoresumeMinutes 0 (off) → never resume', () => {
    expect(shouldAutoResume(state({ paused_at: NOW - 999 * 60000 }), 0, NOW)).toBe(false);
  });
  test('not paused → no resume', () => {
    expect(shouldAutoResume(state({ paused: 0, paused_at: NOW - 999 * 60000 }), 30, NOW)).toBe(false);
  });
  test('manual off is not auto-resumed', () => {
    expect(shouldAutoResume(state({ paused_reason: 'manual', paused_at: NOW - 999 * 60000 }), 30, NOW)).toBe(false);
  });
  test('null state → no resume', () => {
    expect(shouldAutoResume(null, 30, NOW)).toBe(false);
  });
});
