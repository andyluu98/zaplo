import React, { useEffect, useMemo, useState, useCallback } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { try { return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
// JS getDay(): Sun=0..Sat=6. Stored weekday CSV convention (agent editor): CN=1, T2=2 ... T7=7.
const wdValue = (date: Date) => { const g = date.getDay(); return g === 0 ? 1 : g + 1; };
const csvHas = (csv: string | undefined, v: number) => String(csv || '').split(',').map(s => s.trim()).filter(Boolean).includes(String(v));

type View = 'month' | 'week' | 'day';

// Does a recurring schedule (kind !== 'once') fire on the given date?
function recurringMatches(sch: any, y: number, m: number, d: number): boolean {
  if (!sch || sch.kind === 'once' || sch.enabled === 0 || sch.enabled === false) return false;
  const date = new Date(y, m, d);
  if (sch.kind === 'daily') return true;
  if (sch.kind === 'weekly') return csvHas(sch.weekdays, wdValue(date));
  if (sch.kind === 'monthly') { const dim = new Date(y, m + 1, 0).getDate(); return csvHas(sch.month_days, Math.min(d, dim)); }
  return false;
}

export default function CalendarTab({ zaloId }: { zaloId: string }) {
  const { showNotification } = useAppStore();
  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m);
  const [once, setOnce] = useState<any[]>([]);   // upcoming one-off entries
  const [logs, setLogs] = useState<any[]>([]);   // posted history (post_log)
  const [agents, setAgents] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<View>('month');
  const [agentFilter, setAgentFilter] = useState<number | null>(null); // null = mọi agent
  const [adding, setAdding] = useState(false);
  const [addAgent, setAddAgent] = useState<number | null>(null);
  const [addTime, setAddTime] = useState('08:00');

  const ym = `${year}-${pad(month + 1)}`;
  const fetchAll = useCallback(async () => {
    if (!zaloId) return;
    const [c, l, a] = await Promise.all([
      ipc.posting?.calendarList({ zaloId, ym }),
      ipc.posting?.logMonth({ zaloId, ym }),
      ipc.posting?.agentList({ zaloId }),
    ]);
    if (c?.success) setOnce(c.entries ?? []);
    if (l?.success) setLogs(l.logs ?? []);
    if (a?.success) setAgents(a.agents ?? []);
  }, [zaloId, ym]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const move = (d: number) => { let m = month + d, y = year; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); setSel(null); };

  // ── Filtering by agent ──────────────────────────────────────────────
  const fLogs = useMemo(() => agentFilter == null ? logs : logs.filter(l => l.agent_id === agentFilter), [logs, agentFilter]);
  const fOnce = useMemo(() => agentFilter == null ? once : once.filter(e => e.agent_id === agentFilter), [once, agentFilter]);

  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 7 : d; })();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayD = (today.y === year && today.m === month) ? today.d : -1;

  // bucket posted logs + once entries by day (using filtered sets)
  const { sentByDay, failByDay, onceByDay } = useMemo(() => {
    const s: Record<number, any[]> = {}, f: Record<number, any[]> = {}, o: Record<number, any[]> = {};
    fLogs.forEach(l => { const d = new Date(l.posted_at).getDate(); const t = l.status === 'sent' ? s : f; t[d] = [...(t[d] || []), l]; });
    fOnce.forEach(e => { const d = parseInt((e.date || '').slice(8, 10), 10); if (d) o[d] = [...(o[d] || []), e]; });
    return { sentByDay: s, failByDay: f, onceByDay: o };
  }, [fLogs, fOnce]);

  // Recurring "dự kiến" prediction for a given day (only future / today)
  const planned = useCallback((d: number): boolean => {
    if (ymd(year, month, d) < ymd(today.y, today.m, today.d)) return false; // chỉ ngày >= hôm nay
    const list = agentFilter == null ? agents : agents.filter(a => a.id === agentFilter);
    return list.some(a => (a.schedules || []).some((s: any) => recurringMatches(s, year, month, d)));
  }, [agents, agentFilter, year, month, today.y, today.m, today.d]);

  const isPast = (d: number) => ymd(year, month, d) < ymd(today.y, today.m, today.d);

  // ── CRUD on once-marks ──────────────────────────────────────────────
  const doAdd = async () => {
    if (sel == null) return;
    if (addAgent == null) { showNotification('Chọn agent trước', 'error'); return; }
    if (isPast(sel)) { showNotification('Không thể thêm mốc cho ngày quá khứ', 'error'); return; }
    const res = await ipc.posting?.calendarAdd({ agentId: addAgent, date: ymd(year, month, sel), time: addTime });
    if (res?.success) { showNotification('Đã thêm mốc đăng', 'success'); setAdding(false); fetchAll(); }
    else showNotification(res?.error || 'Thêm mốc thất bại', 'error');
  };
  const doDelete = async (e: any) => {
    const ok = await showConfirm({ title: 'Xóa mốc đăng?', message: `Mốc ${e.time || e.window_start} của "${e.agent_name}" sẽ bị xóa.`, variant: 'danger', confirmText: 'Xóa' });
    if (!ok) return;
    const res = await ipc.posting?.calendarDelete({ id: e.id, agentId: e.agent_id });
    if (res?.success) { showNotification('Đã xóa mốc', 'success'); fetchAll(); }
    else showNotification(res?.error || 'Xóa thất bại', 'error');
  };
  const doEditTime = async (e: any) => {
    const cur = e.time || e.window_start || '08:00';
    const next = window.prompt('Giờ mới (HH:MM):', cur);
    if (!next || next === cur) return;
    if (!/^\d{1,2}:\d{2}$/.test(next)) { showNotification('Giờ không hợp lệ (HH:MM)', 'error'); return; }
    const del = await ipc.posting?.calendarDelete({ id: e.id, agentId: e.agent_id });
    if (!del?.success) { showNotification(del?.error || 'Đổi giờ thất bại', 'error'); return; }
    const add = await ipc.posting?.calendarAdd({ agentId: e.agent_id, date: e.date, time: next });
    if (add?.success) { showNotification('Đã đổi giờ', 'success'); fetchAll(); }
    else showNotification(add?.error || 'Đổi giờ thất bại', 'error');
  };

  // ── Build the list of days to render per view ───────────────────────
  const monthCells: Array<number | null> = [];
  for (let i = 1; i < firstDow; i++) monthCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthCells.push(d);

  // week days = the 7 days (Mon..Sun) of the week containing selected (or today, or day 1)
  const anchorDay = sel ?? (todayD > 0 ? todayD : 1);
  const weekDays = useMemo(() => {
    const a = new Date(year, month, anchorDay);
    const off = a.getDay() === 0 ? 6 : a.getDay() - 1; // back to Monday
    const monday = new Date(year, month, anchorDay - off);
    return Array.from({ length: 7 }, (_, i) => { const dt = new Date(monday); dt.setDate(monday.getDate() + i); return dt; });
  }, [year, month, anchorDay]);

  const dot = (c: string, extra = '') => <span className={`inline-block w-1.5 h-1.5 rounded-full mr-0.5 ${c} ${extra}`} />;

  // a small cell renderer reused by month + week (d is day-of-current-month or null)
  const renderCell = (dt: Date, key: React.Key, tall = false) => {
    const inMonth = dt.getFullYear() === year && dt.getMonth() === month;
    const d = dt.getDate();
    const dStr = ymd(dt.getFullYear(), dt.getMonth(), d);
    const past = dStr < ymd(today.y, today.m, today.d);
    const isToday = dt.getFullYear() === today.y && dt.getMonth() === today.m && d === today.d;
    const isSel = inMonth && sel === d;
    const s = inMonth ? (sentByDay[d] || []) : [];
    const f = inMonth ? (failByDay[d] || []) : [];
    const o = inMonth ? (onceByDay[d] || []) : [];
    const showPlan = inMonth && planned(d);
    return (
      <div key={key} onClick={() => { if (inMonth) setSel(d); }}
        className={`${tall ? 'min-h-[120px]' : 'min-h-[60px]'} rounded-lg border p-1.5 text-xs cursor-pointer ${past ? 'opacity-50' : ''} ${isSel ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700'} ${isToday ? 'bg-blue-500/5' : inMonth ? 'bg-gray-800/50' : 'bg-gray-900/40'} hover:border-gray-500`}>
        <b className={isToday ? 'text-blue-400' : inMonth ? 'text-gray-300' : 'text-gray-600'}>{d}</b>
        <div className="mt-1 leading-tight">
          {s.map((_, k) => k < 6 && dot('bg-green-400'))}
          {f.map((_, k) => k < 4 && dot('bg-red-400'))}
          {o.map((_, k) => k < 4 && dot('bg-amber-400'))}
          {showPlan && dot('bg-blue-400', 'opacity-[.55]')}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700/60 flex-wrap">
        <span className="cursor-pointer text-gray-300 px-2 text-lg" onClick={() => move(-1)}>‹</span>
        <b className="text-white text-sm">Tháng {month + 1} / {year}</b>
        <span className="cursor-pointer text-gray-300 px-2 text-lg" onClick={() => move(1)}>›</span>

        {/* View chips */}
        <div className="flex gap-1">
          {([['month', 'Tháng'], ['week', 'Tuần'], ['day', 'Ngày']] as Array<[View, string]>).map(([v, t]) => (
            <span key={v} onClick={() => setView(v)}
              className={`text-[11px] px-2 py-0.5 rounded-full cursor-pointer ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-700/60 text-gray-300 hover:bg-gray-600/60'}`}>{t}</span>
          ))}
        </div>

        {/* Agent filter */}
        <select value={agentFilter ?? ''} onChange={e => setAgentFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="text-[12px] bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200">
          <option value="">Mọi agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <span className="ml-auto text-[11px] text-gray-500">
          {dot('bg-green-400')} đã đăng {dot('bg-red-400')} lỗi {dot('bg-amber-400')} mốc sắp tới {dot('bg-blue-400', 'opacity-[.55]')} dự kiến
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── MONTH ── */}
        {view === 'month' && <>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d} className="text-[11px] text-gray-500 text-center font-semibold">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthCells.map((d, i) => d === null ? <div key={i} /> : renderCell(new Date(year, month, d), i))}
          </div>
        </>}

        {/* ── WEEK ── */}
        {view === 'week' && <>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d} className="text-[11px] text-gray-500 text-center font-semibold">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((dt, i) => renderCell(dt, i, true))}
          </div>
        </>}

        {/* ── DAY ── */}
        {view === 'day' && (() => {
          const dt = new Date(year, month, anchorDay);
          return <div className="max-w-md">{renderCell(dt, 'dayBig', true)}</div>;
        })()}

        {/* ── Detail panel (shared) ── */}
        <div className="mt-3 bg-gray-800/60 border border-gray-700 rounded-xl p-3">
          {sel == null ? <span className="text-gray-500 text-sm">Bấm vào một ngày để xem chi tiết bài đã đăng / mốc sắp tới.</span> : (() => {
            const s = sentByDay[sel] || [], f = failByDay[sel] || [], o = onceByDay[sel] || [];
            const past = isPast(sel);
            return <div>
              <div className="flex items-center gap-2">
                <b className="text-white text-sm">Ngày {sel}/{month + 1}/{year}</b>
                {!past && <button onClick={() => { setAdding(v => !v); setAddAgent(agentFilter ?? agents[0]?.id ?? null); }}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white">+ Thêm mốc</button>}
              </div>

              {/* Add form */}
              {adding && !past && <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-gray-900/60 border border-gray-700">
                <select value={addAgent ?? ''} onChange={e => setAddAgent(e.target.value === '' ? null : Number(e.target.value))}
                  className="text-[12px] bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200">
                  <option value="">— chọn agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="time" value={addTime} onChange={e => setAddTime(e.target.value)}
                  className="text-[12px] bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200" />
                <button onClick={doAdd} className="text-[11px] px-2 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white">Lưu</button>
                <button onClick={() => setAdding(false)} className="text-[11px] px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200">Hủy</button>
              </div>}

              {!s.length && !f.length && !o.length && !adding && <span className="text-gray-500 text-sm block mt-2">Chưa có hoạt động.</span>}

              {o.map((e, k) => <div key={'o' + k} className="flex items-center gap-2 mt-2 text-sm">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">⏰ {e.time || e.window_start}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300">{e.agent_name}</span>
                <span className="text-gray-400 text-xs">mốc đăng riêng (sắp tới)</span>
                {e.id != null && <span className="ml-auto flex gap-1">
                  <button onClick={() => doEditTime(e)} title="Đổi giờ" className="text-[11px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">✏️</button>
                  <button onClick={() => doDelete(e)} title="Xóa" className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300">🗑️</button>
                </span>}
              </div>)}

              {s.map((l, k) => <div key={'s' + k} className="flex items-center gap-2 mt-2 text-sm"><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400">✓ {hhmm(l.posted_at)}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300">{l.agent_name || 'legacy'}</span><span className="text-gray-400 text-xs truncate">→ {l.group_name || l.group_id} · {l.draft_text || ''}…</span></div>)}
              {f.map((l, k) => <div key={'f' + k} className="flex items-center gap-2 mt-2 text-sm"><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400">✗ {hhmm(l.posted_at)}</span><span className="text-gray-400 text-xs truncate">→ {l.group_name || l.group_id}</span></div>)}
            </div>;
          })()}
        </div>
        <div className="mt-2 text-[11px] text-gray-500">Lịch hiển thị bài đã đăng (xanh/đỏ), mốc đăng riêng sắp tới (vàng) và lịch định kỳ dự kiến (xanh dương). Lịch định kỳ chạy nền theo cấu hình mỗi agent.</div>
      </div>
    </div>
  );
}
