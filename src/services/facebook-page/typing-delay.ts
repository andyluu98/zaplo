/**
 * typing-delay.ts — shared "human typing" delay used by both the Zalo workflow
 * sender and the Facebook Page sender (red-team H6: the two paths used to compute
 * this separately and drift). Kept dependency-free so it is unit-testable and can
 * be imported from either subsystem.
 *
 * Formula (unchanged from WorkflowEngineService): delay scales with message length,
 * floored at 800ms and capped at 3000ms — always well under Meta's ~20s auto-clear
 * of the typing indicator.
 */

/** Pause between consecutive text segments so they read as separate chat bubbles. */
export const INTER_SEGMENT_DELAY_MS = 600;

/** Pause between consecutive images in one segment. */
export const INTER_IMAGE_DELAY_MS = 500;

const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 3000;

/**
 * Milliseconds to "type" a message of the given text. With `jitter`, adds ±20%
 * randomness so cadence is not robotically identical (Page path); without it the
 * value is deterministic (Zalo path stays byte-identical to its old inline calc).
 * Result is always clamped to [800, 3000]ms.
 */
export function typingDelayMs(text: string, jitter = false): number {
  const base = Math.min(Math.max((text || '').length * 30, MIN_DELAY_MS), MAX_DELAY_MS);
  if (!jitter) return base;
  const factor = 0.8 + Math.random() * 0.4; // 0.8 .. 1.2
  return Math.min(Math.max(Math.round(base * factor), MIN_DELAY_MS), MAX_DELAY_MS);
}
