/**
 * page-webhook-verify.ts — Meta webhook signature verification (pure, no I/O).
 *
 * Meta signs the webhook POST body with the app secret as HMAC-SHA256 and sends
 * it in `X-Hub-Signature-256: sha256=<hex>`. We MUST hash the RAW request bytes
 * (a Buffer) — decoding chunks to strings first corrupts multi-byte UTF-8
 * (Vietnamese, emoji) split across TCP chunks and would fail otherwise-valid
 * signatures (red-team H2). Comparison is constant-time (timingSafeEqual).
 */

import * as crypto from 'crypto';

/** Compute the expected `sha256=…` header value for a raw body + app secret. */
export function computeSignature(rawBody: Buffer, appSecret: string): string {
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify the `X-Hub-Signature-256` header against the raw body. Returns false on
 * any mismatch, missing/blank header or secret, or malformed header — never
 * throws. Uses timingSafeEqual on equal-length buffers to avoid leaking timing.
 */
export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined | null, appSecret: string): boolean {
    if (!signatureHeader || !appSecret || !rawBody) return false;
    if (!signatureHeader.startsWith('sha256=')) return false;

    const expected = computeSignature(rawBody, appSecret);
    const a = Buffer.from(signatureHeader, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    // timingSafeEqual requires equal length; unequal length ⇒ definitely not a match.
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}
