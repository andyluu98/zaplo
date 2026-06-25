import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';

// Modal chọn ảnh 3 nguồn: Máy (openDialog → path tuyệt đối), Thư viện (rel_path), AI sinh (rel_path).
// onConfirm trả mảng path (tuyệt đối hoặc rel_path) — sendApproved tự resolve + upload.

interface Props { accountId: string; onClose: () => void; onConfirm: (paths: string[]) => void; }

export default function FbImagePicker({ accountId, onClose, onConfirm }: Props) {
  const [tab, setTab] = useState<'disk' | 'library' | 'ai'>('disk');
  const [library, setLibrary] = useState<any[]>([]);
  const [selected, setSelected] = useState<Array<{ path: string; thumb?: string }>>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadLibrary = async () => {
    try { const r = await ipc.posting?.imageList({ zaloId: accountId }); if (r?.success) setLibrary(r.assets ?? []); } catch {}
  };
  useEffect(() => { if (tab === 'library') loadLibrary(); }, [tab]);

  const has = (p: string) => selected.some(s => s.path === p);
  const toggle = (path: string, thumb?: string) => setSelected(s => has(path) ? s.filter(x => x.path !== path) : [...s, { path, thumb }]);

  const pickDisk = async () => {
    const r = await ipc.file?.openDialog({ multiSelect: true, filters: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
    if (r?.success && !r.canceled && r.filePaths?.length) {
      setSelected(s => [...s, ...r.filePaths.filter((p: string) => !has(p)).map((p: string) => ({ path: p }))]);
    }
  };

  const genAi = async () => {
    if (!aiPrompt.trim()) { setMsg('Nhập mô tả ảnh.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await ipc.posting?.imageGenerate({ zaloId: accountId, prompt: aiPrompt.trim() });
      const rel = r?.rel_path;
      if (r?.success && rel) setSelected(s => [...s, { path: rel, thumb: toLocalMediaUrl(rel) }]);
      else setMsg(r?.error || 'AI sinh ảnh thất bại.');
    } catch (e: any) { setMsg('Lỗi: ' + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-[640px] max-w-[92vw] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Chọn ảnh ({selected.length})</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          {([['disk', '💻 Từ máy'], ['library', '🖼️ Thư viện'], ['ai', '✨ AI sinh']] as const).map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 text-xs rounded-lg ${tab === id ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300'}`}>{lbl}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'disk' && (
            <button onClick={pickDisk} className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-sm">+ Chọn file ảnh từ máy</button>
          )}
          {tab === 'library' && (
            library.length === 0 ? <div className="text-sm text-gray-500">Thư viện trống.</div> : (
              <div className="grid grid-cols-4 gap-2">
                {library.map((a: any) => (
                  <button key={a.id} onClick={() => toggle(a.rel_path, toLocalMediaUrl(a.rel_path))}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${has(a.rel_path) ? 'border-blue-500' : 'border-transparent'}`}>
                    <img src={toLocalMediaUrl(a.rel_path)} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )
          )}
          {tab === 'ai' && (
            <div className="flex gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Mô tả ảnh muốn tạo..."
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
              <button onClick={genAi} disabled={busy} className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm disabled:opacity-50">{busy ? '...' : 'Sinh'}</button>
            </div>
          )}
          {msg && <div className="text-xs text-amber-400 mt-2">{msg}</div>}

          {selected.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-gray-400 mb-1">Đã chọn:</div>
              <div className="flex flex-wrap gap-2">
                {selected.map((s, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-600 bg-gray-800 flex items-center justify-center">
                    {s.thumb ? <img src={s.thumb} className="w-full h-full object-cover" /> : <span className="text-[9px] text-gray-400 px-1 truncate">{s.path.split(/[\\/]/).pop()}</span>}
                    <button onClick={() => setSelected(arr => arr.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 text-white text-[10px] px-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 text-sm">Hủy</button>
          <button onClick={() => { onConfirm(selected.map(s => s.path)); onClose(); }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">Dùng {selected.length} ảnh</button>
        </div>
      </div>
    </div>
  );
}
