import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { syncZaloGroups } from '@/lib/zaloGroupUtils';
import { getFavGroups, toggleFavGroup } from '@/lib/favorite-groups';

// Tab "Nhóm Zalo" — liệt kê nhóm Zalo của tài khoản.
// "Đồng bộ" gọi syncZaloGroups (fetch LIVE từ Zalo qua zca-js) rồi nạp lại danh sách
// → nhóm mới join trên mobile sẽ xuất hiện (trước đây nhóm chỉ sync 1 lần lúc đăng nhập).

interface ZGroup { groupId: string; name: string; avatar?: string }

export default function ZaloGroupsTab({ zaloId }: { zaloId: string }) {
  const [groups, setGroups] = useState<ZGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'all' | 'fav'>('all');

  useEffect(() => { setFavs(getFavGroups(zaloId)); }, [zaloId]);
  const toggleFav = (id: string) => setFavs(toggleFavGroup(zaloId, id));

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await ipc.posting?.groupsList({ zaloId });
      if (res?.success) setGroups(res.groups ?? []);
      else setErr(res?.error || 'Không lấy được danh sách nhóm.');
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [zaloId]);

  useEffect(() => { load(); }, [load]);

  // Đồng bộ LIVE từ Zalo: lấy lại toàn bộ nhóm tài khoản đang tham gia rồi nạp lại.
  const sync = useCallback(async () => {
    const acc = useAccountStore.getState().accounts.find(a => a.zalo_id === zaloId);
    if (!acc) { setErr('Không tìm thấy tài khoản.'); return; }
    setSyncing(true); setErr(''); setSyncMsg('Đang kết nối Zalo và lấy danh sách nhóm…');
    try {
      const auth = { cookies: (acc as any).cookies, imei: (acc as any).imei, userAgent: (acc as any).user_agent };
      await syncZaloGroups({
        activeAccountId: zaloId,
        auth,
        onProgress: (p: any) => {
          if (p?.phase === 'groups') setSyncMsg(`Đồng bộ nhóm ${p.current}/${p.total}…`);
          else if (p?.currentGroupName) setSyncMsg(`Tải thành viên: ${p.currentGroupName}…`);
        },
      });
      setSyncMsg('Đã đồng bộ xong.');
      await load();
    } catch (e: any) {
      setErr('Đồng bộ lỗi: ' + (e?.message || e) + ' (kiểm tra tài khoản Zalo đã kết nối chưa).');
      setSyncMsg('');
    } finally { setSyncing(false); }
  }, [zaloId, load]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let list = view === 'fav' ? groups.filter(g => favs.has(g.groupId)) : groups;
    if (kw) list = list.filter(g => (g.name || '').toLowerCase().includes(kw));
    return [...list].sort((a, b) => (favs.has(b.groupId) ? 1 : 0) - (favs.has(a.groupId) ? 1 : 0));
  }, [groups, q, favs, view]);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="text-[12.5px] text-blue-300 bg-blue-500/8 border border-blue-500/25 rounded-lg px-3 py-2 mb-4">
        💙 Nhóm Zalo lấy <b>trực tiếp từ tài khoản</b>. Vừa join nhóm mới mà chưa thấy? Nhấn "🔄 Đồng bộ" để lấy lại danh sách mới nhất từ Zalo.
      </div>

      {/* Sub-tab: Tất cả / Yêu thích — nhóm yêu thích dùng chung với Soạn & Đăng + Rải bài */}
      <div className="flex items-center gap-1 mb-3">
        <button onClick={() => setView('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg ${view === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/40'}`}>
          Tất cả nhóm ({groups.length})
        </button>
        <button onClick={() => setView('fav')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg ${view === 'fav' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-gray-700/40'}`}>
          ⭐ Nhóm yêu thích ({favs.size})
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={sync} disabled={syncing}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
          {syncing ? 'Đang đồng bộ…' : '🔄 Đồng bộ nhóm Zalo'}
        </button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm nhóm theo tên…"
          className="flex-1 min-w-[200px] bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-1.5 focus:outline-none focus:border-blue-500" />
        <span className="text-sm text-gray-400 whitespace-nowrap">{filtered.length}/{groups.length} nhóm</span>
      </div>

      {syncMsg && <div className="text-sm text-blue-300 mb-2">{syncMsg}</div>}
      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      {filtered.length === 0 && !loading ? (
        <div className="text-gray-500 text-sm py-10 text-center">
          {view === 'fav'
            ? (favs.size === 0 ? 'Chưa có nhóm yêu thích. Bấm ☆ ở tab "Tất cả nhóm" để đánh dấu.' : 'Không có nhóm yêu thích khớp từ khóa.')
            : (groups.length === 0 ? 'Chưa có nhóm. Nhấn "🔄 Đồng bộ nhóm Zalo" để lấy danh sách.' : 'Không có nhóm khớp từ khóa.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(g => (
            <div key={g.groupId} className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
              {g.avatar
                ? <img src={g.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-blue-500/30 flex-shrink-0" />}
              <span className="text-sm text-gray-200 flex-1 truncate">{g.name}</span>
              <button onClick={() => toggleFav(g.groupId)} title={favs.has(g.groupId) ? 'Bỏ yêu thích' : 'Đánh dấu nhóm hay đăng'}
                className={`text-base flex-shrink-0 ${favs.has(g.groupId) ? 'text-amber-400' : 'text-gray-600 hover:text-amber-300'}`}>
                {favs.has(g.groupId) ? '★' : '☆'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
