import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

// Tab "Nhóm": lưu nhóm FB theo tên (dán link + đặt tên) để chọn khi đăng. (Auto-fetch ở phase sau.)

export interface SavedGroup { account_id: string; group_id: string; name: string; source: string; }

export default function FbGroupsManager({ accountId }: { accountId: string }) {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try { const r = await ipc.facebookWrite?.groupList({ accountId }); if (r?.success) setGroups(r.groups ?? []); }
    catch (e) { console.error('[FbGroups]', e); }
  };
  useEffect(() => { load(); }, [accountId]);

  const add = async () => {
    setMsg('');
    if (!link.trim()) { setMsg('Dán link hoặc ID nhóm.'); return; }
    const r = await ipc.facebookWrite?.groupSaveManual({ accountId, linkOrId: link.trim(), name: name.trim() });
    if (r?.success) { setLink(''); setName(''); await load(); }
    else setMsg(r?.error || 'Lưu thất bại');
  };

  const del = async (groupId: string) => {
    await ipc.facebookWrite?.groupDelete({ accountId, groupId });
    await load();
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-2xl">
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
          <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Thêm nhóm (dán link + đặt tên)</h3>
          <div className="space-y-2">
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="Link nhóm hoặc ID (vd: facebook.com/groups/1870942289894981)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên gợi nhớ (vd: Khởi nghiệp Cần Thơ)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
            <button onClick={add} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">➕ Lưu nhóm</button>
            {msg && <span className="ml-3 text-sm text-amber-400">{msg}</span>}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Nhóm đã lưu</h3>
          <span className="text-xs text-gray-500">{groups.length} nhóm</span>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl divide-y divide-gray-700/60">
          {groups.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6">Chưa lưu nhóm nào</div>
          ) : groups.map(g => (
            <div key={g.group_id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex-none" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate">{g.name}</div>
                <div className="text-[11px] text-gray-500">{g.group_id} · {g.source === 'fetched' ? 'tự lấy' : 'thủ công'}</div>
              </div>
              <button onClick={() => del(g.group_id)} className="text-gray-500 hover:text-red-400 text-sm flex-none">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
