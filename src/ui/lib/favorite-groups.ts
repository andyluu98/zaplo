// Quản lý "nhóm yêu thích" theo từng tài khoản (lưu localStorage).
// Dùng chung cho: tab Soạn & Đăng, tab Nhóm Zalo, modal Rải bài → gắn sao ở đâu
// cũng đồng bộ. Key theo accountId (zaloId của Zalo / id tài khoản FB) nên không lẫn kênh.

const keyOf = (accountId: string) => `favGroups:${accountId}`;

export function getFavGroups(accountId: string): Set<string> {
  if (!accountId) return new Set();
  try {
    const raw = localStorage.getItem(keyOf(accountId));
    return raw ? new Set<string>(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function setFavGroups(accountId: string, ids: Set<string>): void {
  try { localStorage.setItem(keyOf(accountId), JSON.stringify([...ids])); } catch {}
}

/** Bật/tắt yêu thích 1 nhóm, lưu lại, trả về Set mới. */
export function toggleFavGroup(accountId: string, groupId: string): Set<string> {
  const s = getFavGroups(accountId);
  s.has(groupId) ? s.delete(groupId) : s.add(groupId);
  setFavGroups(accountId, s);
  return new Set(s);
}
