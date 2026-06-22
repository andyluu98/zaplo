import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import ipc from '@/lib/ipc';
import AgentEditorModal from './agent-editor-modal';

function fmtTime(ms: number | null): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return '—'; }
}

type StatusFilter = 'all' | 'running' | 'paused';

// Small modal listing post logs for a single agent (filtered client-side by agent_id).
function AgentLogModal({ zaloId, agent, onClose }: { zaloId: string; agent: any; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await ipc.posting?.logList({ zaloId, limit: 500 });
        if (alive && res?.success) setLogs((res.logs ?? []).filter((l: any) => l.agent_id === agent.id));
      } catch (e) { console.error('[AgentLogModal]', e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [zaloId, agent.id]);

  const statusChip = (s: string) => {
    const map: Record<string, string> = {
      sent: 'bg-green-900/40 text-green-400', failed: 'bg-red-900/40 text-red-400',
      skipped: 'bg-gray-700 text-gray-400', pending: 'bg-amber-900/40 text-amber-400',
    };
    return map[s] || 'bg-gray-700 text-gray-400';
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88%] overflow-hidden flex flex-col rounded-2xl bg-gray-900 border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center px-4 py-3 border-b border-gray-700"><b className="text-white text-[15px]">📜 Nhật ký · {agent.name}</b><span className="ml-auto cursor-pointer text-gray-500 text-lg" onClick={onClose}>✕</span></div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="text-center text-gray-500 text-sm py-10">Đang tải…</div>
            : logs.length === 0 ? <div className="text-center text-gray-500 text-sm py-10">Chưa có lượt đăng nào của agent này</div>
            : (
              <div className="flex flex-col gap-1.5">
                {logs.map((l: any) => (
                  <div key={l.id} className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300">{fmtTime(l.posted_at)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusChip(l.status)}`}>{l.status}</span>
                      <span className="ml-auto text-gray-500">👥 {l.group_id}</span>
                    </div>
                    {l.error && <div className="mt-1 text-red-400 break-words">{l.error}</div>}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default function AgentsTab({ zaloId }: { zaloId: string }) {
  const { showNotification } = useAppStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [assistantNames, setAssistantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ open: boolean; id: number | null; cloneFrom: any | null }>({ open: false, id: null, cloneFrom: null });
  const [logFor, setLogFor] = useState<any | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchAgents = useCallback(async () => {
    if (!zaloId) return;
    setLoading(true);
    try { const res = await ipc.posting?.agentList({ zaloId }); if (res?.success) setAgents(res.agents ?? []); }
    catch (e) { console.error('[AgentsTab]', e); } finally { setLoading(false); }
  }, [zaloId]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  // Resolve assistant_id → name once, to show the real assistant on each card.
  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.ai?.listAssistants();
        if (res?.success) {
          const map: Record<string, string> = {};
          (res.assistants ?? []).forEach((a: any) => { map[String(a.id)] = a.name; });
          setAssistantNames(map);
        }
      } catch (e) { console.error('[AgentsTab] assistants', e); }
    })();
  }, [zaloId]);

  const toggle = async (a: any) => {
    setBusy(a.id);
    const res = await ipc.posting?.agentEnable({ id: a.id, enabled: a.enabled !== 1 });
    if (res?.success) { showNotification(a.enabled ? 'Đã tạm dừng' : 'Đã bật agent', 'success'); await fetchAgents(); }
    else showNotification(res?.error || 'Lỗi', 'error');
    setBusy(null);
  };
  const postNow = async (a: any) => {
    const names = (a.groupNames || []).join(', ') || '(chưa có nhóm)';
    const ok = await showConfirm({ title: `Đăng thử bằng "${a.name}"?`, message: `Sẽ đăng 1 bài tới ${(a.group_ids || []).length} nhóm: ${names}`, confirmText: 'Đăng ngay' });
    if (!ok) return;
    setBusy(a.id);
    const res = await ipc.posting?.agentPostNow({ agentId: a.id });
    showNotification(res?.ok ? `Đã đăng ${res.sentCount}/${res.total} nhóm${res.postedText ? ' — "' + res.postedText + '…"' : ''}` : (res?.error || 'Đăng thất bại'), res?.ok ? 'success' : 'error');
    await fetchAgents(); setBusy(null);
  };
  const del = async (a: any) => {
    const ok = await showConfirm({ title: `Xóa agent "${a.name}"?`, message: 'Lịch và liên kết của agent sẽ bị xóa. Bài đã sinh vẫn giữ.', variant: 'danger', confirmText: 'Xóa' });
    if (!ok) return;
    const res = await ipc.posting?.agentDelete({ id: a.id });
    if (res?.success) { showNotification('Đã xóa agent', 'success'); await fetchAgents(); }
  };

  const schedSummary = (a: any): string => {
    const rec = (a.schedules || []).find((s: any) => s.kind !== 'once');
    if (!rec) return 'Chưa đặt lịch';
    const k = rec.kind === 'daily' ? 'Hằng ngày' : rec.kind === 'weekly' ? `Hằng tuần (${rec.weekdays})` : `Hằng tháng (${rec.month_days})`;
    const once = (a.schedules || []).filter((s: any) => s.kind === 'once').length;
    return `${k} ${rec.window_start}–${rec.window_end} · ${rec.posts_per_day} bài/ngày${once ? ` · +${once} mốc` : ''}`;
  };

  const assistantLabel = (a: any): string => {
    if (!a.assistant_id) return 'Mặc định';
    return assistantNames[String(a.assistant_id)] || 'Trợ lý riêng';
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter(a => {
      if (q && !(a.name || '').toLowerCase().includes(q)) return false;
      if (statusFilter === 'running' && a.enabled !== 1) return false;
      if (statusFilter === 'paused' && a.enabled === 1) return false;
      return true;
    });
  }, [agents, query, statusFilter]);

  const filterChip = (active: boolean) => `px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        <input className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs w-48 focus:outline-none focus:border-blue-500" placeholder="🔎 Tìm agent…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="flex gap-1.5">
          <span className={filterChip(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>Tất cả</span>
          <span className={filterChip(statusFilter === 'running')} onClick={() => setStatusFilter('running')}>Đang chạy</span>
          <span className={filterChip(statusFilter === 'paused')} onClick={() => setStatusFilter('paused')}>Tạm dừng</span>
        </div>
        <span className="text-xs text-gray-500">{filtered.length}/{agents.length} agent</span>
        <button className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold" onClick={() => setEditing({ open: true, id: null, cloneFrom: null })}>＋ Tạo Agent</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? <div className="text-center text-gray-500 text-sm py-12">Đang tải…</div>
          : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <p className="text-gray-400 text-sm">Chưa có agent nào</p>
              <p className="text-gray-600 text-xs">Tạo agent để tự động viết &amp; đăng bài đều theo lịch</p>
              <button className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold" onClick={() => setEditing({ open: true, id: null, cloneFrom: null })}>＋ Tạo Agent đầu tiên</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-12">Không có agent khớp bộ lọc</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map(a => {
                const st = a.status || {};
                return (
                  <div key={a.id} className={`rounded-xl border bg-gray-800 p-3.5 ${a.enabled ? 'border-green-700/40' : 'border-gray-700'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{a.name}</span>
                      {a.enabled ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400">Đang chạy</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Tạm dừng</span>}
                      {/^agent mặc định$/i.test(a.name || '') && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400" title="Tạo tự động từ cấu hình cũ">tự chuyển từ bản cũ</span>}
                      {st.lastError && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400" title={st.lastError}>⚠ Lỗi lần cuối</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5">🔑 {assistantLabel(a)} · 🧩 {(a.pillar_ids || []).length} chủ đề</div>
                    <div className="text-xs text-gray-400 mt-1">👥 {(a.groupNames || []).join(', ') || 'Chưa chọn nhóm'}</div>
                    <div className="text-xs text-gray-400 mt-1">🕒 {schedSummary(a)}</div>
                    <div className="text-xs text-gray-400 mt-1">▶ Chạy kế: <b className="text-gray-200">{fmtTime(st.nextRunAt)}</b> · Lần cuối: {fmtTime(st.lastRunAt)}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.approvedDrafts ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>✓ {st.approvedDrafts ?? 0} đã duyệt</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.pendingDrafts ? 'bg-amber-900/40 text-amber-400' : 'bg-gray-700 text-gray-500'}`}>⏳ {st.pendingDrafts ?? 0} chờ duyệt</span>
                    </div>
                    {a.approval_mode === 'manual' && (st.approvedDrafts ?? 0) === 0 && a.enabled &&
                      <div className="mt-2 text-[11px] text-amber-400 bg-amber-900/10 border border-amber-700/30 rounded-lg px-2.5 py-1.5">Chưa có bài đã duyệt → chưa đăng được. Vào "Duyệt bài" để duyệt.</div>}
                    {st.lastError &&
                      <div className="mt-2 text-[11px] text-red-300 bg-red-900/10 border border-red-700/30 rounded-lg px-2.5 py-1.5">⚠ Lần đăng gần nhất lỗi: <b>{st.lastError}</b></div>}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <button disabled={busy === a.id} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-700/30 text-emerald-300 disabled:opacity-50" onClick={() => postNow(a)}>⚡ Đăng thử</button>
                      <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300" onClick={() => setEditing({ open: true, id: a.id, cloneFrom: null })}>Sửa</button>
                      <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300" onClick={() => setEditing({ open: true, id: null, cloneFrom: a })}>⧉ Nhân bản</button>
                      <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300" onClick={() => setLogFor(a)}>📜 Nhật ký</button>
                      <button disabled={busy === a.id} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300 disabled:opacity-50" onClick={() => toggle(a)}>{a.enabled ? 'Tạm dừng' : 'Bật lại'}</button>
                      <button className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/20 text-red-300" onClick={() => del(a)}>Xóa</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
      {editing.open && <AgentEditorModal zaloId={zaloId} agentId={editing.id} cloneFrom={editing.cloneFrom} onClose={() => setEditing({ open: false, id: null, cloneFrom: null })} onSaved={fetchAgents} />}
      {logFor && <AgentLogModal zaloId={zaloId} agent={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}
