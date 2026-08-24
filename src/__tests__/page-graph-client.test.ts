import { translateMetaError, MetaGraphError, GRAPH_BASE, GRAPH_VERSION } from '../services/facebook-page/page-graph-client';

/** Shape a fake axios error carrying a Graph API error payload. */
function graphErr(code: number, subcode?: number, message = 'x') {
  return { response: { data: { error: { code, error_subcode: subcode, message } } } };
}

describe('translateMetaError', () => {
  it('maps token errors (190 and session codes) to kind=token', () => {
    for (const c of [190, 102, 463, 467]) {
      const m = translateMetaError(graphErr(c));
      expect(m).toBeInstanceOf(MetaGraphError);
      expect(m.kind).toBe('token');
      expect(m.code).toBe(c);
    }
  });

  it('maps rate-limit codes (4/17/32/613) to kind=rate_limit', () => {
    for (const c of [4, 17, 32, 613]) {
      expect(translateMetaError(graphErr(c)).kind).toBe('rate_limit');
    }
  });

  it('maps permission codes (10 and 200-299) to kind=permission', () => {
    expect(translateMetaError(graphErr(10)).kind).toBe('permission');
    expect(translateMetaError(graphErr(200)).kind).toBe('permission');
    expect(translateMetaError(graphErr(299)).kind).toBe('permission');
  });

  it('maps unrecognised graph codes to kind=unknown but keeps the code', () => {
    const m = translateMetaError(graphErr(1234));
    expect(m.kind).toBe('unknown');
    expect(m.code).toBe(1234);
  });

  it('preserves the error subcode', () => {
    expect(translateMetaError(graphErr(190, 460)).subcode).toBe(460);
  });

  it('handles a non-Graph (network) error without a response payload', () => {
    const m = translateMetaError({ message: 'ETIMEDOUT' });
    expect(m.kind).toBe('unknown');
    expect(m.code).toBe(0);
    expect(m.message).toContain('ETIMEDOUT');
  });

  it('never leaks token/secret text — message is a safe, translated string', () => {
    // The raw payload message is only surfaced for the generic "unknown" bucket;
    // token/rate/permission buckets use fixed safe copy.
    expect(translateMetaError(graphErr(190, 460, 'token=SECRET123')).message).not.toContain('SECRET123');
    expect(translateMetaError(graphErr(613, undefined, 'app_secret=abc')).message).not.toContain('abc');
  });

  it('pins the Graph API version to v25.0', () => {
    expect(GRAPH_VERSION).toBe('v25.0');
    expect(GRAPH_BASE).toBe('https://graph.facebook.com/v25.0');
  });
});
