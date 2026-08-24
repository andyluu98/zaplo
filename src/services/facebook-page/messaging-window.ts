/**
 * messaging-window.ts — Meta's 24-hour standard messaging window.
 *
 * A Page may send a normal RESPONSE message only within 24h of the customer's last
 * message. Outside it, calling the Send API returns error 10 (#10) — so the agent
 * must NOT call the API; the thread goes to a human queue instead. Pure + dependency
 * -free so it is unit-testable.
 */

/** 24 hours in milliseconds. */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Can the Page send a standard message right now?
 * `lastCustomerMessageAt` is the epoch-ms timestamp of the customer's most recent
 * inbound message (from `fb_page.last_customer_message_at`). Returns false when it
 * is missing/zero (no customer message ever → nothing to respond to) or older than
 * 24h.
 */
export function canSendNow(lastCustomerMessageAt: number | null | undefined, now: number = Date.now()): boolean {
  if (!lastCustomerMessageAt || lastCustomerMessageAt <= 0) return false;
  return now - lastCustomerMessageAt < MESSAGING_WINDOW_MS;
}
