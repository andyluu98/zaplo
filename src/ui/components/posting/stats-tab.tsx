import React, { useEffect, useState, useCallback } from 'react';
import ipc from '@/lib/ipc';

type Period = 'today' | '7d' | '30d' | 'all';
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'today', label: 'Hôm nay' }, { id: '7d', label: '7 ngày' }, { id: '30d', label: '30 ngày' }, { id: 'all', label: 'Tất cả' },
];
// sinceMs for a period (undefined = all-time). KPI numbers then match the chosen label.
function sinceMsFor(p: Period): number | undefined {
  if (p === 'all') return undefined;
  if (p === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  const days = p === '7d' ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function StatsTab({ zaloId }: { zaloId: string }) {
  const [stats, setStats] = useState<Array<{ agent_id: number; name: string; sent: number; failed: number }>>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [agentId, setAgentId] = useState<number | ''>('');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const fetchAll = useCallback(async () => {
    if (!zaloId) return;
    const sinceMs = sinceMsFor(period);
    // KPI + bars use stats(sinceMs) so numbers match the period; feed uses logMonth (recent, this month).
    const [s, l, a] = await Promise.all([
      ipc.posting?.stats({ zaloId, agentId: agentId || undefined, sinceMs }),
      ipc.posting?.logMonth({ zaloId, ym }),
      ipc.posting?.agentList({ zaloId }),
    ]);
    if (s?.success) setStats(s.stats ?? []);
    if (a?.success) setAgents(a.agents ?? []);
    if (l?.success) {
      let logs = l.logs ?? [];
      if (agentId) logs = logs.filter((x: any) => x.agent_id === agentId);
      setRecent(logs.slice(0, 12));
    }
  }, [zaloId, ym, period, agentId]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalSent = stats.reduce((s, x) => s + (x.sent || 0), 0);
  const totalFail = stats.reduce((s, x) => s + (x.failed || 0), 0);
  const rate = totalSent + totalFail > 0 ? Math.round((totalSent / (totalSent + totalFail)) * 100) : 100;
  const max = Math.max(1, ...stats.map(s => (s.sent || 0) + (s.failed || 0)));
  const activeAgents = agents.filter(a => a.enabled !== 0 && a.enabled !== false).length;
  const periodLabel = (PERIODS.find(p => p.id === period)?.label || '').toLowerCase();
  const fmt = (ms: number) => { try { return new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };

  const KPI = ({ v, l, c }: { v: any; l: string; c: string }) => (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4"><div className={`text-3xl font-extrabold ${c}`}>{v}</div><div className="text-xs text-gray-500 mt-0.5">{l}</div></div>
  );
  const fld = 'px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-blue-500';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Period + agent filters */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold ${period === p.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}`}>{p.label}</button>
        ))}
        <select value={agentId} onChange={e => setAgentId(e.target.value ? Number(e.target.value) : '')} className={fld + ' ml-auto'}>
          <option value="">Mọi agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPI v={totalSent} l={`Đã đăng (${periodLabel})`} c="text-green-400" />
        <KPI v={totalFail} l="Lỗi" c="text-red-400" />
        <KPI v={`${rate}%`} l="Tỷ lệ thành công" c={rate >= 90 ? 'text-green-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400'} />
        <KPI v={activeAgents} l="Agent hoạt động" c="text-blue-400" />
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 mb-4">
        <b className="text-white text-sm">Hiệu suất theo agent</b>
        {stats.length === 0 ? <div className="text-gray-500 text-sm mt-2">Chưa có dữ liệu đăng bài trong khoảng này.</div>
          : <div className="mt-3 space-y-3">{stats.map(s => {
              const total = (s.sent || 0) + (s.failed || 0);
              return (
                <div key={s.agent_id}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-300 truncate">{s.name}</span><span className="text-gray-500">{s.sent} gửi{s.failed ? ` · ${s.failed} lỗi` : ''}</span></div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-900" style={{ width: `${(total / max) * 100}%`, minWidth: '8%' }}>
                    <div className="bg-green-500 h-3" style={{ width: `${total ? (s.sent / total) * 100 : 0}%` }} />
                    <div className="bg-red-500 h-3" style={{ width: `${total ? (s.failed / total) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}</div>}
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <b className="text-white text-sm">Hoạt động gần đây</b>
        {recent.length === 0 ? <div className="text-gray-500 text-sm mt-2">Chưa có hoạt động.</div>
          : <div className="mt-2 divide-y divide-gray-700/60">{recent.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${l.status === 'sent' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{l.status === 'sent' ? '✓' : '✗'}</span>
                <span className="text-gray-400 text-xs w-24 flex-shrink-0">{fmt(l.posted_at)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300 flex-shrink-0">{l.agent_name || 'legacy'}</span>
                <span className="text-gray-400 text-xs truncate">→ {l.group_name || l.group_id}</span>
              </div>
            ))}</div>}
      </div>
    </div>
  );
}
