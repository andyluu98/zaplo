import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import ipc from '@/lib/ipc';
import ChatAgentEditorModal from './chat-agent-editor-modal';

type SubNav = 'list' | 'routing';

// ─── Danh sách Agent chat ────────────────────────────────────────────────────
function AgentList({ zaloId }: { zaloId: string }) {
  const { showNotification } = useAppStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [assistantNames, setAssistantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  const fetchAgents = useCallback(async () => {
    if (!zaloId) return;
    setLoading(true);
    try { const res = await ipc.chatAgent?.list({ zaloId }); if (res?.success) setAgents(res.agents ?? []); }
    catch (e) { console.error('[ChatAgentList]', e); } finally { setLoading(false); }
  }, [zaloId]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.ai?.listAssistants();
        if (res?.success) {
          const map: Record<string, string> = {};
          (res.assistants ?? []).forEach((a: any) => { map[String(a.id)] = a.name; });
          setAssistantNames(map);
        }
      } catch (e) { console.error('[ChatAgentList] assistants', e); }
    })();
  }, [zaloId]);

  const toggle = async (a: any) => {
    setBusy(a.id);
    const res = await ipc.chatAgent?.enable({ id: a.id, enabled: a.enabled !== 1 });
    if (res?.success) { showNotification(a.enabled ? 'Đã tạm dừng' : 'Đã bật agent', 'success'); await fetchAgents(); }
    else showNotification(res?.error || 'Lỗi', 'error');
    setBusy(null);
  };
  const del = async (a: any) => {
    const ok = await showConfirm({ title: `Xóa agent "${a.name}"?`, message: 'Liên kết nhóm/nhãn của agent sẽ bị xóa.', variant: 'danger', confirmText: 'Xóa' });
    if (!ok) return;
    const res = await ipc.chatAgent?.delete({ id: a.id });
    if (res?.success) { showNotification('Đã xóa agent', 'success'); await fetchAgents(); }
  };

  const assistantLabel = (a: any): string => {
    if (!a.assistant_id) return 'Mặc định';
    return assistantNames[String(a.assistant_id)] || 'Trợ lý riêng';
  };
  const modeLabel = (a: any): string => (a.reply_mode === 'suggest' ? '✍️ Gợi ý' : '⚡ Tự gửi');

  const filtered = agents.filter(a => !query.trim() || (a.name || '').toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs w-48 focus:outline-none focus:border-blue-500" placeholder="🔎 Tìm agent…" value={query} onChange={e => setQuery(e.target.value)} />
        <span className="text-xs text-gray-500">{filtered.length}/{agents.length} agent</span>
        <button className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold" onClick={() => setEditing({ open: true, id: null })}>＋ Tạo Agent chat</button>
      </div>

      {loading ? <div className="text-center text-gray-500 text-sm py-12">Đang tải…</div>
        : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-gray-400 text-sm">Chưa có agent chat nào</p>
            <p className="text-gray-600 text-xs">Tạo agent để tự động trả lời tin nhắn theo nhóm / nhãn</p>
            <button className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold" onClick={() => setEditing({ open: true, id: null })}>＋ Tạo Agent đầu tiên</button>
          </div>
        ) : filtered.length === 0 ? <div className="text-center text-gray-500 text-sm py-12">Không có agent khớp</div>
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map(a => (
              <div key={a.id} className={`rounded-xl border bg-gray-800 p-3.5 ${a.is_default ? 'border-amber-600/50' : a.enabled ? 'border-green-700/40' : 'border-gray-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{a.name}</span>
                  {a.enabled ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400">Đang chạy</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Tạm dừng</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300">{modeLabel(a)}</span>
                  {a.is_default ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300">⭐ MẶC ĐỊNH</span> : null}
                </div>
                <div className="text-xs text-gray-400 mt-1.5">🔑 Trợ lý: <b className="text-gray-200">{assistantLabel(a)}</b></div>
                <div className="text-xs text-gray-400 mt-1">👥 {a.is_default ? 'Khách mới / nhóm chưa gán' : ((a.groupNames || []).join(', ') || 'Chưa chọn nhóm')}</div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300" onClick={() => setEditing({ open: true, id: a.id })}>Sửa</button>
                  <button disabled={busy === a.id} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300 disabled:opacity-50" onClick={() => toggle(a)}>{a.enabled ? 'Tạm dừng' : 'Bật lại'}</button>
                  {!a.is_default && <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/20 text-red-300" onClick={() => del(a)}>Xóa</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      {editing.open && <ChatAgentEditorModal zaloId={zaloId} agentId={editing.id} onClose={() => setEditing({ open: false, id: null })} onSaved={fetchAgents} />}
    </>
  );
}

// ─── Bảng định tuyến ─────────────────────────────────────────────────────────
function RoutingTable({ zaloId }: { zaloId: string }) {
  const { showNotification } = useAppStore();
  const [rows, setRows] = useState<Array<{ groupId: string; name: string; agentId: number | null }>>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!zaloId) return;
    setLoading(true);
    try {
      const [ag, gr] = await Promise.all([ipc.chatAgent?.list({ zaloId }), ipc.posting?.groupsList({ zaloId })]);
      if (ag?.success) setAgents(ag.agents ?? []);
      const groups = gr?.success ? (gr.groups ?? []) : [];
      // Resolve agent phụ trách cho từng nhóm.
      const resolved = await Promise.all(groups.map(async (g: any) => {
        let agentId: number | null = null;
        try { const r = await ipc.chatAgent?.resolveThread({ zaloId, threadId: g.groupId, threadType: 'group' }); agentId = r?.agentId ?? null; } catch {}
        return { groupId: g.groupId, name: g.name, agentId };
      }));
      setRows(resolved);
    } catch (e) { console.error('[RoutingTable]', e); } finally { setLoading(false); }
  }, [zaloId]);
  useEffect(() => { load(); }, [load]);

  const onPin = async (groupId: string, value: string) => {
    const agentId = value ? Number(value) : null;
    const res = await ipc.chatAgent?.pin({ zaloId, threadId: groupId, agentId });
    if (res?.success) { showNotification('Đã ghim agent cho hội thoại', 'success'); setRows(rs => rs.map(r => r.groupId === groupId ? { ...r, agentId } : r)); }
    else showNotification(res?.error || 'Lỗi', 'error');
  };

  return (
    <>
      <div className="bg-blue-900/10 border border-blue-700/30 rounded-lg px-3 py-2.5 text-[11px] text-blue-300 mb-3">
        <b>Thứ tự ưu tiên (gặp đầu tiên thì dừng):</b> 🔖 Ghim trực tiếp › 🏷️ Nhãn › 👥 Nhóm › ⭐ Agent mặc định. Đổi agent ở cột dưới = ghim trực tiếp.
      </div>
      {loading ? <div className="text-center text-gray-500 text-sm py-12">Đang tải…</div>
        : rows.length === 0 ? <div className="text-center text-gray-500 text-sm py-12">Chưa có nhóm nào được đồng bộ</div>
        : (
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left font-semibold px-3 py-2">Hội thoại / nhóm</th>
                <th className="text-left font-semibold px-3 py-2">Agent phụ trách</th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.groupId} className="border-b border-gray-800">
                    <td className="px-3 py-2 text-gray-200 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      <select className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                        value={r.agentId ?? ''} onChange={e => onPin(r.groupId, e.target.value)}>
                        <option value="">— Agent mặc định —</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

// ─── Tab gốc ─────────────────────────────────────────────────────────────────
export default function ChatAgentsTab({ zaloId }: { zaloId: string }) {
  const [sub, setSub] = useState<SubNav>('list');
  const subBtn = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${on ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300'}`;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex gap-1.5 mb-4">
        <span className={subBtn(sub === 'list')} onClick={() => setSub('list')}>💬 Danh sách Agent</span>
        <span className={subBtn(sub === 'routing')} onClick={() => setSub('routing')}>🧭 Bảng định tuyến</span>
      </div>
      {sub === 'list' ? <AgentList zaloId={zaloId} /> : <RoutingTable zaloId={zaloId} />}
    </div>
  );
}
