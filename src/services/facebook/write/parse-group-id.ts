/**
 * parse-group-id.ts
 * Lấy ID nhóm Facebook (số) từ link hoặc id thô.
 * Vanity slug (không phải số) → '' (caller báo lỗi yêu cầu id số).
 */
export function parseGroupId(input: string): string {
  const t = (input || '').trim();
  const m = t.match(/groups\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(t)) return t;
  return '';
}
