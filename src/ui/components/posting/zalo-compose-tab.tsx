import React, { useEffect, useMemo, useState } from 'react';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';
import { getFavGroups, toggleFavGroup } from '@/lib/favorite-groups';

// Tab "Soạn & Đăng" (Zalo) — soạn tay/AI → chọn ảnh + nhóm → đăng ngay.
// Đăng ngay dùng ipc.posting.manualPost (tái dùng engine gửi, không sửa code cũ).
// Hẹn lịch/rải bài sẽ ở tab "Lịch nội dung" (Phase C).

interface ZGroup { groupId: string; name: string }
interface Img { id: number; rel_path: string }

export default function ZaloComposeTab({ zaloId }: { zaloId: string }) {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [assistantId, setAssistantId] = useState('');
  const [content, setContent] = useState('');
  const [groups, setGroups] = useState<ZGroup[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [selImgs, setSelImgs] = useState<Set<number>>(new Set());
  const [gq, setGq] = useState('');                          // tìm nhóm theo từ khóa
  const [favs, setFavs] = useState<Set<string>>(new Set());  // nhóm yêu thích (lưu theo tài khoản)
  const [aiBusy, setAiBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setFavs(getFavGroups(zaloId)); }, [zaloId]);
  const toggleFav = (id: string) => setFavs(toggleFavGroup(zaloId, id));
  const selectFavs = () => setSelGroups(prev => { const n = new Set(prev); favs.forEach(id => n.add(id)); return n; });

  // Lọc theo từ khóa + đẩy nhóm yêu thích lên đầu.
  const visibleGroups = useMemo(() => {
    const kw = gq.trim().toLowerCase();
    const list = kw ? groups.filter(g => (g.name || '').toLowerCase().includes(kw)) : groups;
    return [...list].sort((a, b) => (favs.has(b.groupId) ? 1 : 0) - (favs.has(a.groupId) ? 1 : 0));
  }, [groups, gq, favs]);

  useEffect(() => {
    (async () => {
      try {
        const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []);
        const g = await ipc.posting?.groupsList({ zaloId }); if (g?.success) setGroups(g.groups ?? []);
        const im = await ipc.posting?.imageList({ zaloId }); if (im?.success) setImages((im.assets ?? []) as any);
      } catch (e) { console.error('[ZaloCompose] load', e); }
    })();
  }, [zaloId]);

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const aiWrite = async () => {
    if (!assistantId) { setMsg('Chọn trợ lý AI để viết.'); return; }
    setAiBusy(true); setMsg('');
    try {
      const prompt = content.trim() || 'Viết 1 bài đăng nhóm Zalo thu hút, thân thiện.';
      const r = await ipc.ai?.chat(assistantId, [{ role: 'user', content: prompt }]);
      if (r?.success && r?.result) setContent(r.result); else setMsg('AI không trả về nội dung.');
    } catch (e: any) { setMsg('Lỗi AI: ' + (e?.message || e)); }
    finally { setAiBusy(false); }
  };

  const post = async () => {
    const groupIds = [...selGroups];
    if (!groupIds.length) { setMsg('Chọn ít nhất 1 nhóm Zalo.'); return; }
    if (!content.trim() && selImgs.size === 0) { setMsg('Nhập nội dung hoặc chọn ảnh.'); return; }
    setPosting(true); setMsg('');
    try {
      const res = await ipc.posting?.manualPost({ zaloId, text: content.trim(), groupIds, imageAssetIds: [...selImgs] });
      if (res?.success) setMsg(`Xong: ✅ ${res.sent || 0} nhóm · ❌ ${res.failed || 0} nhóm.`);
      else setMsg('Lỗi: ' + (res?.error || 'không đăng được'));
    } catch (e: any) { setMsg('Lỗi: ' + (e?.message || e)); }
    finally { setPosting(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: nội dung */}
        <div className="space-y-3">
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <label className="block text-xs text-gray-400 mb-1">Trợ lý AI (để AI viết)</label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2">
              <option value="">— Tự viết —</option>
              {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="block text-xs text-gray-400 mb-1 mt-3">Nội dung bài viết</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={7}
              placeholder="Nhập nội dung… hoặc để AI viết giúp."
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
            <button onClick={aiWrite} disabled={aiBusy}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50">
              {aiBusy ? '✨ Đang viết…' : '✨ AI viết'}
            </button>
          </div>

          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-2">Ảnh đính kèm ({selImgs.size} đã chọn)</div>
            {images.length === 0 ? (
              <div className="text-xs text-gray-500">Chưa có ảnh. Vào tab "Thư viện ảnh" để tải lên.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                {images.map(im => {
                  const on = selImgs.has(im.id);
                  return (
                    <button key={im.id} onClick={() => toggle(setSelImgs, im.id)}
                      className={`relative rounded-md overflow-hidden border-2 ${on ? 'border-blue-500' : 'border-transparent'}`}>
                      <img src={toLocalMediaUrl(im.rel_path)} alt="" className="w-full h-14 object-cover" />
                      {on && <span className="absolute top-0.5 right-0.5 text-[10px] bg-blue-500 text-white rounded px-1">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: nhóm + đăng */}
        <div className="space-y-3">
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Đăng tới nhóm Zalo ({selGroups.size} đã chọn)</span>
              <div className="flex items-center gap-2">
                {favs.size > 0 && (
                  <button onClick={selectFavs} className="text-[11px] text-amber-400 hover:underline">⭐ Chọn nhóm yêu thích ({favs.size})</button>
                )}
                <button onClick={() => setSelGroups(selGroups.size === groups.length ? new Set() : new Set(groups.map(g => g.groupId)))}
                  className="text-[11px] text-blue-400 hover:underline">{selGroups.size === groups.length ? 'Bỏ chọn' : 'Chọn tất cả'}</button>
              </div>
            </div>
            <input value={gq} onChange={e => setGq(e.target.value)} placeholder="🔍 Tìm nhóm theo tên…"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-1.5 mb-2 focus:outline-none focus:border-blue-500" />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {groups.length === 0 && <div className="text-xs text-gray-500">Chưa có nhóm. Vào tab "Nhóm Zalo" → Đồng bộ.</div>}
              {groups.length > 0 && visibleGroups.length === 0 && <div className="text-xs text-gray-500">Không có nhóm khớp từ khóa.</div>}
              {visibleGroups.map(g => (
                <div key={g.groupId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-700/40">
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={selGroups.has(g.groupId)} onChange={() => toggle(setSelGroups, g.groupId)} />
                    <span className="text-sm text-gray-200 truncate">{g.name}</span>
                  </label>
                  <button onClick={() => toggleFav(g.groupId)} title={favs.has(g.groupId) ? 'Bỏ yêu thích' : 'Đánh dấu nhóm hay đăng'}
                    className={`text-sm flex-shrink-0 ${favs.has(g.groupId) ? 'text-amber-400' : 'text-gray-600 hover:text-amber-300'}`}>
                    {favs.has(g.groupId) ? '★' : '☆'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={post} disabled={posting}
            className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold disabled:opacity-50">
            {posting ? 'Đang đăng…' : '✅ Đăng ngay'}
          </button>
          {msg && <div className="text-sm text-gray-300">{msg}</div>}
          <div className="text-[11px] text-gray-500">📅 Hẹn lịch / rải bài nhiều ngày: dùng tab "Lịch nội dung".</div>
        </div>
      </div>
    </div>
  );
}
