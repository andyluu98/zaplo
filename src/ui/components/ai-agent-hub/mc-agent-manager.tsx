import React, { useCallback, useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';

// ─── Types ───────────────────────────────────────────────────────────────────
type Channel = 'fb' | 'zalo';
interface McAccount { id: string; channel: Channel; name: string }
interface McGroup   { id: string; name: string }
interface McTarget  { channel: Channel; accountId: string; groupIds: string[] }
interface McAgent   { id?: number; name: string; assistantId: string; type: 'posting'; contentSource: 'store' | 'ai' | 'random'; scheduleJson: string; enabled: boolean; targets: McTarget[] }
interface McAgentRow { id: number; name: string; channels: Channel[]; accountCount: number; groupCount: number; enabled: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const chBadge = (ch: Channel) => ch === 'fb'
  ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-300">FB</span>
  : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300">Zalo</span>;

const BLANK_AGENT: McAgent = { name: '', assistantId: '', type: 'posting', contentSource: 'store', scheduleJson: '{}', enabled: true, targets: [] };

// ─── List View ───────────────────────────────────────────────────────────────
function ListView({ onEdit, onNew }: { onEdit: (id: number) => void; onNew: () => void }) {
  const { showNotification } = useAppStore();
  const [agents, setAgents] = useState<McAgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc.agentMc?.list();
      if (res?.success) setAgents(res.agents ?? []);
    } catch (e) { console.error('[McAgentManager] list', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (a: McAgentRow) => {
    const res = await ipc.agentMc?.setEnabled({ id: a.id, enabled: !a.enabled });
    if (res?.success) { showNotification(!a.enabled ? 'Đã bật agent' : 'Đã tắt agent', 'success'); load(); }
    else showNotification(res?.error || 'Lỗi', 'error');
  };

  const del = async (a: McAgentRow) => {
    if (!window.confirm(`Xóa agent "${a.name}"?`)) return;
    const res = await ipc.agentMc?.delete({ id: a.id });
    if (res?.success) { showNotification('Đã xóa', 'success'); load(); }
    else showNotification(res?.error || 'Lỗi', 'error');
  };

  if (loading) return <div className="text-center text-gray-500 py-16 text-sm">Đang tải…</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button onClick={onNew} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">+ Tạo Agent đa kênh</button>
      </div>
      {agents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-gray-400 text-sm">Chưa có Agent đa kênh nào</p>
          <p className="text-gray-600 text-xs">Tạo agent để tự động đăng bài lên nhiều kênh / tài khoản</p>
          <button onClick={onNew} className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">+ Tạo Agent đầu tiên</button>
        </div>
      ) : agents.map(a => (
        <div key={a.id} className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-sm">{a.name}</span>
              {(a.channels ?? []).map(ch => <span key={ch}>{chBadge(ch)}</span>)}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{a.accountCount ?? 0} tài khoản · {a.groupCount ?? 0} nhóm</p>
          </div>
          <label className="relative cursor-pointer">
            <input type="checkbox" className="sr-only" checked={!!a.enabled} onChange={() => toggleEnabled(a)} />
            <div className={`w-9 h-5 rounded-full transition-colors ${a.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${a.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </label>
          <button onClick={() => onEdit(a.id)} className="px-2.5 py-1 rounded-lg text-xs bg-gray-700 text-gray-300 hover:bg-gray-600">Sửa</button>
          <button onClick={() => del(a)} className="px-2.5 py-1 rounded-lg text-xs bg-red-700/20 text-red-300 hover:bg-red-700/40">Xóa</button>
        </div>
      ))}
    </div>
  );
}

// ─── Editor View ─────────────────────────────────────────────────────────────
function EditorView({ editId, onDone }: { editId: number | null; onDone: () => void }) {
  const { showNotification } = useAppStore();
  const [agent, setAgent] = useState<McAgent>(BLANK_AGENT);
  const [assistants, setAssistants] = useState<{ id: string; name: string }[]>([]);
  const [allAccounts, setAllAccounts] = useState<McAccount[]>([]);
  const [groupCache, setGroupCache] = useState<Record<string, McGroup[]>>({});
  const [openGroupPicker, setOpenGroupPicker] = useState<string | null>(null); // accountId
  const [sched, setSched] = useState({ winStart: '08:00', winEnd: '21:00', perDay: 3 });

  useEffect(() => {
    (async () => {
      const [ar, aa] = await Promise.all([ipc.ai?.listAssistants(), ipc.agentMc?.listAccounts()]);
      if (ar?.success) setAssistants(ar.assistants ?? []);
      if (aa?.success) setAllAccounts(aa.accounts ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const res = await ipc.agentMc?.get({ id: editId });
      if (res?.success && res.agent) {
        const a = res.agent;
        setAgent({ id: a.id, name: a.name, assistantId: String(a.assistant_id ?? ''), type: 'posting', contentSource: a.content_source ?? 'store', scheduleJson: a.schedule_json ?? '{}', enabled: !!a.enabled, targets: a.targets ?? [] });
        try { const s = JSON.parse(a.schedule_json ?? '{}'); setSched({ winStart: s.winStart ?? '08:00', winEnd: s.winEnd ?? '21:00', perDay: s.perDay ?? 3 }); } catch {}
      }
    })();
  }, [editId]);

  const loadGroups = async (accountId: string, channel: Channel) => {
    if (groupCache[accountId]) return;
    const res = await ipc.agentMc?.groups({ accountId, channel });
    if (res?.success) setGroupCache(c => ({ ...c, [accountId]: res.groups ?? [] }));
  };

  const addAccount = (acc: McAccount) => {
    if (agent.targets.find(t => t.accountId === acc.id)) return;
    setAgent(a => ({ ...a, targets: [...a.targets, { channel: acc.channel, accountId: acc.id, groupIds: [] }] }));
  };

  const removeTarget = (accountId: string) => setAgent(a => ({ ...a, targets: a.targets.filter(t => t.accountId !== accountId) }));

  const toggleGroup = (accountId: string, gid: string) => setAgent(a => ({
    ...a,
    targets: a.targets.map(t => t.accountId !== accountId ? t : {
      ...t, groupIds: t.groupIds.includes(gid) ? t.groupIds.filter(g => g !== gid) : [...t.groupIds, gid]
    })
  }));

  const save = async () => {
    if (!agent.name.trim()) { showNotification('Nhập tên agent', 'error'); return; }
    if (!agent.assistantId) { showNotification('Chọn trợ lý AI', 'error'); return; }
    if (!agent.targets.length) { showNotification('Thêm ít nhất 1 tài khoản', 'error'); return; }
    const scheduleJson = JSON.stringify({ winStart: sched.winStart, winEnd: sched.winEnd, perDay: Number(sched.perDay) });
    const res = await ipc.agentMc?.save({ agent: { ...agent, scheduleJson } });
    if (res?.success) { showNotification('Đã lưu agent', 'success'); onDone(); }
    else showNotification(res?.error || 'Lỗi khi lưu', 'error');
  };

  const inp = 'bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500 w-full';
  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300 hover:border-gray-400'}`;
  const accountsNotAdded = allAccounts.filter(a => !agent.targets.find(t => t.accountId === a.id));

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={onDone} className="text-gray-400 hover:text-white text-sm">← Quay lại</button>
        <h2 className="text-white font-semibold">{editId ? 'Sửa' : 'Tạo'} Agent đa kênh</h2>
      </div>

      {/* Tên */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Tên Agent</label>
        <input className={inp} placeholder="VD: Bot đăng bài FB + Zalo sáng" value={agent.name} onChange={e => setAgent(a => ({ ...a, name: e.target.value }))} />
      </div>

      {/* Trợ lý AI */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Trợ lý AI</label>
        <select className={inp} value={agent.assistantId} onChange={e => setAgent(a => ({ ...a, assistantId: e.target.value }))}>
          <option value="">— Chọn trợ lý —</option>
          {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Nguồn nội dung */}
      <div>
        <label className="text-xs text-gray-400 mb-2 block">Nguồn nội dung</label>
        <div className="flex gap-2 flex-wrap">
          {(['store', 'ai', 'random'] as const).map(src => (
            <span key={src} className={pill(agent.contentSource === src)} onClick={() => setAgent(a => ({ ...a, contentSource: src }))}>
              {src === 'store' ? 'Kho bài' : src === 'ai' ? 'AI sinh' : '🎲 Random Kho bài'}
            </span>
          ))}
        </div>
      </div>

      {/* Tài khoản phụ trách */}
      <div>
        <label className="text-xs text-gray-400 mb-2 block">Tài khoản phụ trách</label>
        {agent.targets.map(t => {
          const acc = allAccounts.find(a => a.id === t.accountId);
          const groups = groupCache[t.accountId] ?? [];
          return (
            <div key={t.accountId} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 mb-2">
              <div className="flex items-center gap-2">
                {chBadge(t.channel)}
                <span className="text-sm text-white flex-1">{acc?.name ?? t.accountId}</span>
                <button className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                  onClick={() => { loadGroups(t.accountId, t.channel); setOpenGroupPicker(openGroupPicker === t.accountId ? null : t.accountId); }}>
                  Chọn nhóm ({t.groupIds.length})
                </button>
                <button onClick={() => removeTarget(t.accountId)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
              </div>
              {openGroupPicker === t.accountId && (
                <div className="mt-2 max-h-40 overflow-y-auto flex flex-col gap-1">
                  {groups.length === 0 ? <p className="text-xs text-gray-500">Không có nhóm</p> : groups.map(g => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                      <input type="checkbox" checked={t.groupIds.includes(g.id)} onChange={() => toggleGroup(t.accountId, g.id)} className="accent-blue-500" />
                      {g.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {accountsNotAdded.length > 0 && (
          <select className={`${inp} mt-1`} value="" onChange={e => { const acc = allAccounts.find(a => a.id === e.target.value); if (acc) addAccount(acc); }}>
            <option value="">+ Thêm tài khoản…</option>
            {accountsNotAdded.map(a => <option key={a.id} value={a.id}>{a.name} ({a.channel === 'fb' ? 'FB' : 'Zalo'})</option>)}
          </select>
        )}
      </div>

      {/* Lịch */}
      <div>
        <label className="text-xs text-gray-400 mb-2 block">Lịch đăng</label>
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Giờ bắt đầu</label>
            <input type="time" className={`${inp} w-32`} value={sched.winStart} onChange={e => setSched(s => ({ ...s, winStart: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Giờ kết thúc</label>
            <input type="time" className={`${inp} w-32`} value={sched.winEnd} onChange={e => setSched(s => ({ ...s, winEnd: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Số bài/ngày</label>
            <input type="number" min={1} max={50} className={`${inp} w-24`} value={sched.perDay} onChange={e => setSched(s => ({ ...s, perDay: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-3 pt-2">
        <button onClick={onDone} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm">Hủy</button>
        <button onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">💾 Lưu Agent</button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function McAgentManager() {
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editId, setEditId] = useState<number | null>(null);

  const openEdit = (id: number) => { setEditId(id); setView('edit'); };
  const openNew  = ()           => { setEditId(null); setView('edit'); };
  const back     = ()           => { setView('list'); setEditId(null); };

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {view === 'list'
        ? <ListView onEdit={openEdit} onNew={openNew} />
        : <EditorView editId={editId} onDone={back} />}
    </div>
  );
}
