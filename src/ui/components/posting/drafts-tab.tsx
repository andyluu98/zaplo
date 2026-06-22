import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import { showConfirm } from '../common/ConfirmDialog';
import ipc from '@/lib/ipc';
import DraftEditModal from './draft-edit-modal';
import type { ContentDraft, DraftApprovalStatus, PostLog } from '@/../../src/models/automation';

type StatusFilter = DraftApprovalStatus | 'all' | 'failed';
const STATUS_LABELS: Record<DraftApprovalStatus | 'all', string> = { all: 'Tất cả', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', posted: 'Đã đăng' };
const STATUS_BADGE: Record<DraftApprovalStatus, string> = {
  pending: 'bg-yellow-900/40 text-yellow-400', approved: 'bg-green-900/40 text-green-400',
  rejected: 'bg-red-900/40 text-red-400', posted: 'bg-blue-900/40 text-blue-400',
};
const fmtTime = (ts?: number) => ts ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export default function DraftsTab({ zaloId }: { zaloId: string }) {
  const { showNotification } = useAppStore();
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [agentFilter, setAgentFilter] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingDraft, setEditingDraft] = useState<ContentDraft | null>(null);
  const [genAgentId, setGenAgentId] = useState<number | ''>('');
  const [genCount, setGenCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [failedLogs, setFailedLogs] = useState<Map<number, string>>(new Map()); // draft_id → error

  const agentMap = useMemo(() => { const m = new Map<number, any>(); agents.forEach(a => m.set(a.id, a)); return m; }, [agents]);
  const imageMap = useMemo(() => { const m = new Map<number, string>(); images.forEach(a => { if (a.id != null) m.set(a.id, a.rel_path); }); return m; }, [images]);

  const fetchAll = useCallback(async () => {
    if (!zaloId) return;
    setLoading(true);
    setSelected(new Set());
    try {
      // 'failed' fetches all statuses then narrows by failed logs; others filter by status server-side
      const status = filter === 'all' || filter === 'failed' ? undefined : filter;
      const [d, a, im] = await Promise.all([
        ipc.posting?.draftList({ zaloId, status, agentId: agentFilter || undefined }),
        ipc.posting?.agentList({ zaloId }), ipc.posting?.imageList({ zaloId }),
      ]);
      if (a?.success) setAgents(a.agents ?? []);
      if (im?.success) setImages(im.assets ?? []);
      const pool = d?.success ? (d.drafts ?? []) : [];
      if (filter === 'failed') {
        const lg = await ipc.posting?.logList({ zaloId });
        const logs: PostLog[] = lg?.success ? (lg.logs ?? []) : [];
        const errMap = new Map<number, string>();
        logs.filter(l => l.status === 'failed' && l.draft_id != null)
          .filter(l => !agentFilter || l.agent_id === agentFilter)
          .forEach(l => { if (!errMap.has(l.draft_id!)) errMap.set(l.draft_id!, l.error || 'Lỗi không rõ'); });
        setFailedLogs(errMap);
        setDrafts(pool.filter(x => x.id != null && errMap.has(x.id)));
      } else {
        setFailedLogs(new Map());
        setDrafts(pool);
      }
    } catch (e) { console.error('[DraftsTab]', e); } finally { setLoading(false); }
  }, [zaloId, filter, agentFilter]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // oldest approved draft = next FIFO post
  const nextFifoId = useMemo(() => {
    const approved = drafts.filter(d => d.approval_status === 'approved' && d.id != null);
    if (!approved.length) return null;
    return approved.reduce((a, b) => (a.created_at ?? Infinity) <= (b.created_at ?? Infinity) ? a : b).id!;
  }, [drafts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? drafts.filter(d => d.text.toLowerCase().includes(q)) : drafts;
  }, [drafts, search]);

  const setStatus = async (d: ContentDraft, status: DraftApprovalStatus) => {
    if (d.id == null) return;
    const fn = status === 'approved' ? ipc.posting?.draftApprove : ipc.posting?.draftReject;
    const res = await fn?.({ zaloId, id: d.id });
    if (res?.success) { showNotification(status === 'approved' ? 'Đã duyệt' : 'Đã từ chối', 'success'); fetchAll(); }
    else showNotification(res?.error || 'Lỗi', 'error');
  };

  const handleEdit = async (text: string, imageAssetId: number | null) => {
    if (!editingDraft?.id) return;
    const res = await ipc.posting?.draftUpdate({ zaloId, id: editingDraft.id, text, imageAssetId });
    if (res?.success) { showNotification('Đã lưu bài', 'success'); setEditingDraft(null); fetchAll(); }
    else showNotification(res?.error || 'Lưu thất bại', 'error');
  };

  const handleGenerate = async () => {
    if (!genAgentId || generating) return;
    const agent = agentMap.get(genAgentId as number);
    const pillarId = (agent?.pillar_ids || [])[0];
    if (!pillarId) { showNotification('Agent này chưa gán chủ đề — vào Agents → Sửa để gán', 'error'); return; }
    setGenerating(true);
    try {
      const res = await ipc.posting?.draftGenerate({ zaloId, pillarId, count: genCount, agentId: genAgentId as number });
      if (res?.success) { showNotification(`Đã sinh ${res.ids?.length ?? genCount} bài cho "${agent.name}"`, 'success'); fetchAll(); }
      else showNotification(res?.error || 'Sinh bài thất bại', 'error');
    } catch (e: any) { showNotification(e?.message || 'Lỗi', 'error'); } finally { setGenerating(false); }
  };

  const postDraftNow = async (d: ContentDraft) => {
    if (!d.agent_id) { showNotification('Bài này chưa thuộc agent nào — không đăng được. Sinh bài từ tab Agents.', 'error'); return; }
    setBusy(d.id!);
    const res = await ipc.posting?.agentPostNow({ agentId: d.agent_id, draftId: d.id });
    showNotification(res?.ok ? `Đã đăng tới ${res.sentCount}/${res.total} nhóm` : (res?.error || 'Đăng thất bại'), res?.ok ? 'success' : 'error');
    await fetchAll(); setBusy(null);
  };

  const handleDelete = async (d: ContentDraft) => {
    if (d.id == null) return;
    const ok = await showConfirm({ title: 'Xóa bài nháp này?', message: 'Bài sẽ bị xóa vĩnh viễn.', confirmText: 'Xóa', variant: 'danger' });
    if (!ok) return;
    const res = await ipc.posting?.draftDelete({ zaloId, id: d.id });
    if (res?.success) { showNotification('Đã xóa bài', 'success'); fetchAll(); }
    else showNotification(res?.error || 'Xóa thất bại', 'error');
  };

  const toggleSel = (id: number) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (status: DraftApprovalStatus) => {
    const fn = status === 'approved' ? ipc.posting?.draftApprove : ipc.posting?.draftReject;
    await Promise.all([...selected].map(id => fn?.({ zaloId, id })));
    showNotification(`Đã ${status === 'approved' ? 'duyệt' : 'từ chối'} ${selected.size} bài`, 'success');
    fetchAll();
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${on ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}`;
  const fld = 'px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-blue-500';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Generate bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        <span className="text-xs text-gray-500">Sinh bài cho agent:</span>
        <select value={genAgentId} onChange={e => setGenAgentId(e.target.value ? Number(e.target.value) : '')} className={fld + ' flex-1 min-w-0'}>
          <option value="">-- Chọn agent --</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="number" min={1} max={10} value={genCount} onChange={e => setGenCount(Math.max(1, Math.min(10, Number(e.target.value))))} className={fld + ' w-14 text-center'} />
        <button onClick={handleGenerate} disabled={!genAgentId || generating} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50">{generating ? 'Đang sinh…' : 'Sinh bài bằng AI'}</button>
      </div>
      {/* Filters + search */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        {(Object.keys(STATUS_LABELS) as (DraftApprovalStatus | 'all')[]).map(s => <button key={s} onClick={() => setFilter(s)} className={chip(filter === s)}>{STATUS_LABELS[s]}</button>)}
        <button onClick={() => setFilter('failed')} className={chip(filter === 'failed') + (filter === 'failed' ? '' : ' text-red-400 hover:text-red-300')}>⚠ Lỗi</button>
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value ? Number(e.target.value) : '')} className={fld + ' ml-2'}>
          <option value="">Mọi agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nội dung…" className={fld + ' w-40'} />
        <span className="ml-auto text-[11px] text-gray-600">{visible.length} bài</span>
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="text-center text-gray-500 text-sm py-12">Đang tải…</div>
          : visible.length === 0 ? <div className="text-center py-12"><p className="text-gray-400 text-sm">Không có bài nào</p><p className="text-gray-600 text-xs mt-1">Chọn agent ở trên rồi "Sinh bài bằng AI"</p></div>
          : visible.map(d => {
            const ag = d.agent_id ? agentMap.get(d.agent_id) : null;
            const relPath = d.image_asset_id ? imageMap.get(d.image_asset_id) : undefined;
            const isLong = d.text.length > 180;
            const failErr = d.id != null ? failedLogs.get(d.id) : undefined;
            const isNext = d.id != null && d.id === nextFifoId;
            return (
              <div key={d.id} className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <input type="checkbox" checked={d.id != null && selected.has(d.id)} onChange={() => d.id != null && toggleSel(d.id)} className="accent-blue-600" />
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[d.approval_status]}`}>{STATUS_LABELS[d.approval_status]}</span>
                  {isNext && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 font-semibold">→ Tiếp theo</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{d.source === 'ai' ? '🤖 AI' : '✍️ Tay'}</span>
                  {ag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">🤖 {ag.name}</span>}
                  {ag && <span className="text-[10px] text-gray-500">→ {(ag.groupNames || []).join(', ') || 'chưa có nhóm'}</span>}
                  {!d.agent_id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">không thuộc agent</span>}
                  <span className="ml-auto text-[10px] text-gray-500">{fmtTime(d.updated_at)}</span>
                </div>
                <div className="flex gap-3">
                  {relPath && <img src={toLocalMediaUrl(relPath)} className="w-14 h-14 rounded-lg object-cover border border-gray-700 flex-shrink-0" />}
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words flex-1">{isLong ? d.text.slice(0, 180) + '…' : d.text}</p>
                </div>
                {failErr && <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-[11px] text-red-300">⚠ Lỗi: {failErr}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {failErr && <button disabled={busy === d.id} onClick={() => postDraftNow(d)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-700/30 text-amber-300 disabled:opacity-50">↻ Đăng lại</button>}
                  {d.approval_status === 'pending' && <>
                    <button onClick={() => setStatus(d, 'approved')} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-700/30 text-green-400">Phê duyệt</button>
                    <button onClick={() => setStatus(d, 'rejected')} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/30 text-red-400">Từ chối</button>
                  </>}
                  {d.approval_status === 'approved' && <>
                    <button disabled={busy === d.id} onClick={() => postDraftNow(d)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-700/30 text-emerald-300 disabled:opacity-50">⚡ Đăng ngay</button>
                    <button onClick={() => setStatus(d, 'rejected')} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/30 text-red-400">Từ chối</button>
                  </>}
                  {d.approval_status === 'rejected' && <button onClick={() => setStatus(d, 'approved')} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-700/30 text-green-400">Khôi phục (duyệt)</button>}
                  <button onClick={() => setEditingDraft(d)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 text-gray-300">Sửa</button>
                  <button onClick={() => handleDelete(d)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/30 text-red-400">Xóa</button>
                </div>
              </div>
            );
          })}
      </div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-700 bg-gray-900 flex-shrink-0">
          <span className="text-xs text-gray-300">Đã chọn {selected.size}</span>
          <button onClick={() => bulk('approved')} className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-green-700/40 text-green-300">Duyệt {selected.size}</button>
          <button onClick={() => bulk('rejected')} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-700/40 text-red-300">Từ chối {selected.size}</button>
        </div>
      )}
      {editingDraft && <DraftEditModal draft={editingDraft} images={images} onSave={handleEdit} onClose={() => setEditingDraft(null)} />}
    </div>
  );
}
