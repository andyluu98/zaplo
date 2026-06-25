/**
 * parse-group-csv.ts
 * Parse CSV nhóm: mỗi dòng "id_hoặc_link[,\t]tên". Lấy id số (parseGroupId), bỏ dòng lỗi,
 * dedupe theo id. Tên thiếu → dùng id. Thuần (dễ test).
 */
import { parseGroupId } from './parse-group-id';

export function parseGroupCsv(text: string): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/[,\t]/).map(c => c.trim());
    const id = parseGroupId(cols[0]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: cols.slice(1).join(' ').trim() || id });
  }
  return out;
}
