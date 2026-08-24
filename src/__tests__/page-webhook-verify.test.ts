import * as crypto from 'crypto';
import { computeSignature, verifySignature } from '../services/facebook-page/page-webhook-verify';

const SECRET = 'app-secret-123';

function sign(raw: Buffer, secret = SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
}

describe('page webhook signature verification', () => {
  it('accepts a correct signature over the raw body', () => {
    const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [] }), 'utf8');
    expect(verifySignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const raw = Buffer.from('{"a":1}', 'utf8');
    const sig = sign(raw);
    const tampered = Buffer.from('{"a":2}', 'utf8');
    expect(verifySignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const raw = Buffer.from('{"a":1}', 'utf8');
    expect(verifySignature(raw, sign(raw, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects missing/blank header or secret without throwing', () => {
    const raw = Buffer.from('{}', 'utf8');
    expect(verifySignature(raw, undefined, SECRET)).toBe(false);
    expect(verifySignature(raw, '', SECRET)).toBe(false);
    expect(verifySignature(raw, sign(raw), '')).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const raw = Buffer.from('{}', 'utf8');
    const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect(verifySignature(raw, hex, SECRET)).toBe(false); // missing "sha256="
  });

  it('verifies Vietnamese + emoji content that spans multiple TCP chunks', () => {
    // A body with multi-byte UTF-8 chars. Reassemble from chunks split MID-CHARACTER
    // to prove we hash the concatenated bytes (Buffer), not per-chunk strings.
    const text = 'Chào bạn, cho mình hỏi giá 🎉🐉 nhé — cảm ơn!';
    const raw = Buffer.from(JSON.stringify({ object: 'page', text }), 'utf8');
    const sig = sign(raw);

    // Split at an offset INSIDE a multi-byte sequence: find the first non-ASCII
    // lead byte (>=0x80) and cut right after it, leaving its continuation byte in B.
    let cut = raw.length;
    for (let i = 0; i < raw.length; i++) { if (raw[i] >= 0x80) { cut = i + 1; break; } }
    const chunkA = raw.subarray(0, cut);
    const chunkB = raw.subarray(cut);
    const reassembled = Buffer.concat([chunkA, chunkB]);

    expect(reassembled.equals(raw)).toBe(true);
    expect(verifySignature(reassembled, sig, SECRET)).toBe(true);

    // A naive per-chunk toString().concat() would corrupt the split char and differ.
    const naive = Buffer.from(chunkA.toString('utf8') + chunkB.toString('utf8'), 'utf8');
    // Demonstrate the corruption the raw-buffer approach avoids:
    expect(naive.equals(raw)).toBe(false);
    expect(verifySignature(naive, sig, SECRET)).toBe(false);
  });

  it('computeSignature is deterministic and starts with sha256=', () => {
    const raw = Buffer.from('hello', 'utf8');
    const a = computeSignature(raw, SECRET);
    const b = computeSignature(raw, SECRET);
    expect(a).toBe(b);
    expect(a.startsWith('sha256=')).toBe(true);
  });
});
