import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import ipc from '@/lib/ipc';

// One-off calendar entry shown/edited in the form
interface OnceEntry { date: string; time: string; }
type Kind = 'daily' | 'weekly' | 'monthly';
const WD = [['2','T2'],['3','T3'],['4','T4'],['5','T5'],['6','T6'],['7','T7'],['1','CN']]; // value=1..7 (Mon..Sun)

export default function AgentEditorModal({ zaloId, agentId, cloneFrom, onClose, onSaved }: {
  zaloId: string; agentId: number | null; cloneFrom?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showNotification } = useAppStore();
  const [groups, setGroups]       = useState<Array<{ groupId: string; name: string; avatar: string }>>([]);
  const [pillars, setPillars]     = useState<any[]>([]);
  const [assistants, setAssistants] = useState<any[]>([]);
  const [images, setImages]       = useState<any[]>([]);
  const [gQuery, setGQuery]       = useState('');
  const [saving, setSaving]       = useState(false);

  // form state
  const [name, setName]           = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [pillarIds, setPillarIds] = useState<number[]>([]);
  const [groupIds, setGroupIds]   = useState<string[]>([]);
  const [kind, setKind]           = useState<Kind>('daily');
  const [weekdays, setWeekdays]   = useState<string[]>(['2','4','6']);
  const [monthDays, setMonthDays] = useState('1,15');
  const [winStart, setWinStart]   = useState('08:00');
  const [winEnd, setWinEnd]       = useState('11:00');
  const [perDay, setPerDay]       = useState(2);
  const [once, setOnce]           = useState<OnceEntry[]>([]);
  const [newDate, setNewDate]     = useState('');
  const [newTime, setNewTime]     = useState('09:00');
  const [imageMode, setImageMode] = useState<'auto'|'fixed'|'none'>('auto');
  const [imageCount, setImageCount] = useState(2);
  const [fixedIds, setFixedIds]   = useState<number[]>([]);
  const [approval, setApproval]   = useState<'auto'|'manual'>('manual');
  const [enabled, setEnabled]     = useState(true);

  const load = useCallback(async () => {
    // Independent calls — one failing must not blank the others.
    try { const g = await ipc.posting?.groupsList({ zaloId }); if (g?.success) setGroups(g.groups ?? []); } catch (e) { console.error('[AgentEditor] groups', e); }
    try { const p = await ipc.posting?.pillarList({ zaloId }); if (p?.success) setPillars(p.pillars ?? []); } catch (e) { console.error('[AgentEditor] pillars', e); }
    try { const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []); } catch (e) { console.error('[AgentEditor] assistants', e); }
    try { const im = await ipc.posting?.imageList({ zaloId }); if (im?.success) setImages(im.assets ?? []); } catch (e) { console.error('[AgentEditor] images', e); }
    // Apply an agent object (from agentGet or a clone source) onto the form state.
    // `isClone` => editor stays in "create" mode but presets values; name gets " (sao chép)".
    const applyAgent = (ag: any, isClone: boolean) => {
      setName(isClone ? `${ag.name || 'Agent'} (sao chép)` : (ag.name || ''));
      setAssistantId(ag.assistant_id || '');
      setPillarIds(ag.pillar_ids || []); setGroupIds(ag.group_ids || []);
      setImageMode(ag.image_mode || 'auto'); setImageCount(ag.image_count || 2);
      setFixedIds(ag.fixed_image_ids || []); setApproval(ag.approval_mode || 'manual');
      setEnabled(isClone ? false : ag.enabled === 1);
      const rec = (ag.schedules || []).find((s: any) => s.kind !== 'once');
      if (rec) { setKind(rec.kind); setWeekdays((rec.weekdays||'').split(',').filter(Boolean)); setMonthDays(rec.month_days||'1,15'); setWinStart(rec.window_start||'08:00'); setWinEnd(rec.window_end||'11:00'); setPerDay(rec.posts_per_day||2); }
      // Clones do not copy one-off calendar entries (those are past/specific moments).
      if (!isClone) setOnce((ag.schedules || []).filter((s: any) => s.kind === 'once').map((s: any) => ({ date: s.date, time: s.time || s.window_start })));
    };

    if (agentId) {
      const res = await ipc.posting?.agentGet({ id: agentId });
      if (res?.agent) applyAgent(res.agent, false);
    } else if (cloneFrom) {
      applyAgent(cloneFrom, true);
    }
  }, [zaloId, agentId, cloneFrom]);
  useEffect(() => { load(); }, [load]);

  const togNum = (arr: number[], v: number, set: (x: number[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const togStr = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const addOnce = () => {
    if (!newDate) return;
    // Block adding a one-off moment whose date+time is already in the past.
    const at = new Date(`${newDate}T${newTime || '00:00'}`).getTime();
    if (Number.isFinite(at) && at < Date.now()) { showNotification('Mốc đã ở quá khứ — chọn thời điểm tương lai', 'error'); return; }
    setOnce([...once, { date: newDate, time: newTime }]); setNewDate('');
  };

  // Parse "1, 15, 31" → unique valid day-of-month numbers (1–31). Returns [] when nothing valid.
  const parseMonthDays = (raw: string): number[] => {
    const out: number[] = [];
    for (const tok of (raw || '').split(',')) {
      const n = parseInt(tok.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 31 && !out.includes(n)) out.push(n);
    }
    return out;
  };

  const handleSave = async (startNow: boolean) => {
    if (saving) return;
    if (groupIds.length === 0) { showNotification('Chọn ít nhất 1 nhóm', 'error'); return; }
    if (winEnd <= winStart) { showNotification('Giờ kết thúc phải sau giờ bắt đầu', 'error'); return; }
    if (kind === 'weekly' && weekdays.length === 0) { showNotification('Chọn ít nhất 1 thứ trong tuần', 'error'); return; }
    const monthDayNums = parseMonthDays(monthDays);
    if (kind === 'monthly' && monthDayNums.length === 0) { showNotification('Nhập ngày trong tháng hợp lệ (1–31)', 'error'); return; }
    setSaving(true);
    try {
      const schedules: any[] = [{ kind, weekdays: weekdays.join(','), month_days: monthDayNums.join(','), window_start: winStart, window_end: winEnd, posts_per_day: perDay, enabled: 1 }];
      once.forEach(o => schedules.push({ kind: 'once', date: o.date, time: o.time, window_start: o.time, window_end: o.time, posts_per_day: 1, enabled: 1 }));
      const agent = {
        ...(agentId ? { id: agentId } : {}), owner_zalo_id: zaloId, name: name.trim() || 'Agent',
        assistant_id: assistantId, enabled: (startNow || enabled) ? 1 : 0, approval_mode: approval,
        image_mode: imageMode, image_count: imageCount,
        pillar_ids: pillarIds, group_ids: groupIds, fixed_image_ids: fixedIds, schedules,
      };
      const res = await ipc.posting?.agentSave({ zaloId, agent });
      if (res?.success) { showNotification(startNow ? 'Đã lưu & bật agent' : 'Đã lưu agent', 'success'); onSaved(); onClose(); }
      else showNotification(res?.error || 'Lưu thất bại', 'error');
    } catch (e: any) { showNotification(e?.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  };

  const chip = (on: boolean) => `text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${on ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-gray-800 border-gray-600 text-gray-300'}`;
  const lbl = 'block text-[11px] uppercase tracking-wide text-gray-500 mt-3 mb-1';
  const fld = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500';
  const fg = groups.filter(g => g.name.toLowerCase().includes(gQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[94%] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center px-4 py-3 border-b border-gray-700"><b className="text-white text-[15px]">{agentId ? 'Chỉnh sửa Agent' : 'Tạo Agent'}</b><span className="ml-auto cursor-pointer text-gray-500 text-lg" onClick={onClose}>✕</span></div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Tên agent</label><input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="VD: Agent BĐS — LMak" />
            <label className={lbl}>Trợ lý AI (prompt + API)</label>
            <select className={fld} value={assistantId} onChange={e => setAssistantId(e.target.value)}>
              <option value="">— Trợ lý mặc định —</option>
              {assistants.map(a => <option key={a.id} value={a.id}>{a.name}{a.enabled ? '' : ' (tắt)'}</option>)}
            </select>
            <label className={lbl}>Chủ đề phụ trách</label>
            <div className="flex flex-wrap gap-2">{pillars.map(p => <span key={p.id} className={chip(pillarIds.includes(p.id))} onClick={() => togNum(pillarIds, p.id, setPillarIds)}>{p.name}</span>)}{pillars.length === 0 && <span className="text-xs text-gray-500">Chưa có chủ đề — tạo ở tab Chủ đề</span>}</div>
            <label className={lbl}>Nhóm phụ trách ({groupIds.length})</label>
            <input className={fld + ' mb-2'} placeholder="🔎 Tìm nhóm…" value={gQuery} onChange={e => setGQuery(e.target.value)} />
            <div className="max-h-40 overflow-y-auto flex flex-wrap gap-2">
              {groups.length === 0 ? <span className="text-xs text-gray-500">Chưa có nhóm nào được đồng bộ. Mở 1 nhóm Zalo trong app để đồng bộ danh sách nhóm, rồi quay lại.</span>
                : fg.length === 0 ? <span className="text-xs text-gray-500">Không khớp "{gQuery}"</span>
                : fg.map(g => <span key={g.groupId} className={chip(groupIds.includes(g.groupId))} onClick={() => togStr(groupIds, g.groupId, setGroupIds)}>{g.name}</span>)}
            </div>
          </div>
          <div>
            <label className={lbl}>Lịch định kỳ</label>
            <div className="flex gap-2">{(['daily','weekly','monthly'] as Kind[]).map(k => <span key={k} className={chip(kind === k)} onClick={() => setKind(k)}>{k === 'daily' ? 'Hằng ngày' : k === 'weekly' ? 'Hằng tuần' : 'Hằng tháng'}</span>)}</div>
            {kind === 'weekly' && <><label className={lbl}>Chọn thứ</label><div className="flex flex-wrap gap-2">{WD.map(([v, t]) => <span key={v} className={chip(weekdays.includes(v))} onClick={() => togStr(weekdays, v, setWeekdays)}>{t}</span>)}</div></>}
            {kind === 'monthly' && <><label className={lbl}>Ngày trong tháng (1–31)</label><input className={fld} value={monthDays} onChange={e => setMonthDays(e.target.value)} placeholder="VD: 1, 15" /></>}
            <label className={lbl}>Khung giờ · số bài/ngày</label>
            <div className="flex items-center gap-2"><input type="time" className={fld} value={winStart} onChange={e => setWinStart(e.target.value)} /><span className="text-gray-500">→</span><input type="time" className={fld} value={winEnd} onChange={e => setWinEnd(e.target.value)} /></div>
            <div className="flex gap-2 mt-2">{[1,2,3,4,6,8].map(n => <span key={n} className={chip(perDay === n)} onClick={() => setPerDay(n)}>{n}</span>)}</div>
            <label className={lbl}>Mốc calendar (đăng riêng 1 lần)</label>
            {once.map((o, i) => <div key={i} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm mb-1.5">📅 {o.date} · {o.time}<span className="ml-auto text-red-400 cursor-pointer" onClick={() => setOnce(once.filter((_, j) => j !== i))}>✕</span></div>)}
            <div className="flex gap-2"><input type="date" className={fld} value={newDate} onChange={e => setNewDate(e.target.value)} /><input type="time" className={fld + ' max-w-[110px]'} value={newTime} onChange={e => setNewTime(e.target.value)} /><span className={chip(false)} onClick={addOnce}>＋ thêm</span></div>
            <label className={lbl}>Ảnh</label>
            <div className="flex gap-2">{(['auto','fixed','none'] as const).map(m => <span key={m} className={chip(imageMode === m)} onClick={() => setImageMode(m)}>{m === 'auto' ? `Tự lấy ${imageCount}` : m === 'fixed' ? 'Ảnh cố định' : 'Không ảnh'}</span>)}</div>
            {imageMode === 'auto' && <div className="flex gap-2 mt-2">{[1,2,3,4].map(n => <span key={n} className={chip(imageCount === n)} onClick={() => setImageCount(n)}>{n}</span>)}</div>}
            {imageMode === 'fixed' && <div className="grid grid-cols-4 gap-2 mt-2 max-h-40 overflow-y-auto">{images.map(im => <img key={im.id} src={toLocalMediaUrl(im.rel_path)} className={`w-full aspect-square object-cover rounded-lg border-2 cursor-pointer ${fixedIds.includes(im.id) ? 'border-blue-500' : 'border-transparent'}`} onClick={() => togNum(fixedIds, im.id, setFixedIds)} />)}</div>}
            <label className={lbl}>Chế độ duyệt</label>
            <div className="flex gap-2">{(['manual','auto'] as const).map(m => <span key={m} className={chip(approval === m)} onClick={() => setApproval(m)}>{m === 'manual' ? 'Cần duyệt tay' : 'Tự đăng'}</span>)}</div>
            <label className={lbl}>Trạng thái</label>
            <div className="flex gap-2"><span className={chip(enabled)} onClick={() => setEnabled(true)}>Bật</span><span className={chip(!enabled)} onClick={() => setEnabled(false)}>Tắt</span></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button className="px-4 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800" onClick={onClose}>Hủy</button>
          <button className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-200 disabled:opacity-50" disabled={saving} onClick={() => handleSave(false)}>Lưu</button>
          <button className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50" disabled={saving} onClick={() => handleSave(true)}>Lưu &amp; Bật ngay</button>
        </div>
      </div>
    </div>
  );
}
