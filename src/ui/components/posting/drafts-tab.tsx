import React, { useEffect, useState, useCallback } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import ipc from '@/lib/ipc';
import DraftEditModal from './draft-edit-modal';
import type { ContentDraft, DraftApprovalStatus } from '@/../../src/models/automation';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = DraftApprovalStatus | 'all';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Tất cả', pending: 'Chờ duyệt', approved: 'Đã duyệt',
  rejected: 'Từ chối', posted: 'Đã đăng',
};

const STATUS_BADGE: Record<DraftApprovalStatus, string> = {
  pending: 'bg-yellow-900/40 text-yellow-400',
  approved: 'bg-green-900/40 text-green-400',
  rejected: 'bg-red-900/40 text-red-400',
  posted: 'bg-blue-900/40 text-blue-400',
};

// ─── Draft card ───────────────────────────────────────────────────────────────

function DraftCard({ draft, imageUrl, checked, onCheck, onApprove, onReject, onEdit, busy }: {
  draft: ContentDraft; imageUrl: string | null; checked: boolean;
  onCheck: () => void; onApprove: () => void; onReject: () => void;
  onEdit: () => void; busy: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = draft.text.length > 180;

  return (
    <div className={`rounded-xl border bg-gray-800 transition-colors ${checked ? 'border-blue-500/50' : 'border-gray-700 hover:border-gray-600'}`}>
      <div className="flex gap-3 p-3">
        {/* Checkbox */}
        <input type="checkbox" checked={checked} onChange={onCheck}
          className="mt-0.5 w-4 h-4 rounded accent-blue-500 flex-shrink-0 cursor-pointer" />

        {/* Thumbnail */}
        {imageUrl && !imgErr ? (
          <img src={imageUrl} alt="" onError={() => setImgErr(true)} loading="lazy"
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-700" />
        ) : null}

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_BADGE[draft.approval_status]}`}>
              {STATUS_LABELS[draft.approval_status]}
            </span>
            {draft.source === 'ai' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400 flex-shrink-0">AI</span>
            )}
          </div>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
            {isLong && !expanded ? draft.text.slice(0, 180) + '…' : draft.text}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)} className="text-[10px] text-blue-400 hover:text-blue-300 mt-0.5">
              {expanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 px-3 pb-3 pt-0">
        <button onClick={onApprove} disabled={busy || draft.approval_status === 'approved'}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-700/30 hover:bg-green-700/50 text-green-400 transition-colors disabled:opacity-40">
          Phê duyệt
        </button>
        <button onClick={onReject} disabled={busy || draft.approval_status === 'rejected'}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/30 hover:bg-red-700/50 text-red-400 transition-colors disabled:opacity-40">
          Từ chối
        </button>
        <button onClick={onEdit} disabled={busy}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-40">
          Sửa
        </button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function DraftsTab({ zaloId }: { zaloId: string }) {
  const { drafts, setDrafts, upsertDraft, loadingDrafts, setLoadingDrafts,
          imageLibrary, setImageLibrary, pillars, setPillars } = usePostingStore();
  const { showNotification } = useAppStore();

  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingDraft, setEditingDraft] = useState<ContentDraft | null>(null);
  const [genPillarId, setGenPillarId] = useState<number | ''>('');
  const [genCount, setGenCount] = useState(3);
  const [generating, setGenerating] = useState(false);

  // Build image lookup map: id → rel_path
  const imageMap = React.useMemo(() => {
    const m = new Map<number, string>();
    imageLibrary.forEach(a => { if (a.id != null) m.set(a.id, a.rel_path); });
    return m;
  }, [imageLibrary]);

  const fetchAll = useCallback(async (status?: string) => {
    if (!zaloId) return;
    setLoadingDrafts(true);
    try {
      const [draftRes, imgRes, pillarRes] = await Promise.all([
        ipc.posting?.draftList({ zaloId, status: status !== 'all' ? status : undefined }),
        ipc.posting?.imageList({ zaloId }),
        ipc.posting?.pillarList({ zaloId }),
      ]);
      if (draftRes?.success) setDrafts(draftRes.drafts ?? []);
      if (imgRes?.success) setImageLibrary(imgRes.assets ?? []);
      if (pillarRes?.success) {
        const fresh = pillarRes.pillars ?? [];
        setPillars(fresh);
        // Reset generate picker if selected pillar was deleted
        setGenPillarId(prev => {
          if (prev === '') return '';
          return fresh.some(p => p.id === (prev as number)) ? prev : '';
        });
      }
    } catch (e) {
      console.error('[DraftsTab] fetchAll error', e);
    } finally {
      setLoadingDrafts(false);
    }
  }, [zaloId, setDrafts, setImageLibrary, setPillars, setLoadingDrafts]);

  useEffect(() => { fetchAll(filter); }, [fetchAll, filter]);

  const handleApprove = async (draft: ContentDraft) => {
    if (draft.id == null) return;
    const draftId = draft.id;
    const prevStatus = draft.approval_status;
    upsertDraft({ ...draft, approval_status: 'approved' });
    const res = await ipc.posting?.draftApprove({ zaloId, id: draftId });
    if (!res?.success) {
      // Read current draft from store to avoid clobbering concurrent changes
      const current = usePostingStore.getState().drafts.find(d => d.id === draftId);
      if (current) upsertDraft({ ...current, approval_status: prevStatus });
      showNotification(res?.error || 'Phê duyệt thất bại', 'error');
    }
  };

  const handleReject = async (draft: ContentDraft) => {
    if (draft.id == null) return;
    const draftId = draft.id;
    const prevStatus = draft.approval_status;
    upsertDraft({ ...draft, approval_status: 'rejected' });
    const res = await ipc.posting?.draftReject({ zaloId, id: draftId });
    if (!res?.success) {
      // Read current draft from store to avoid clobbering concurrent changes
      const current = usePostingStore.getState().drafts.find(d => d.id === draftId);
      if (current) upsertDraft({ ...current, approval_status: prevStatus });
      showNotification(res?.error || 'Từ chối thất bại', 'error');
    }
  };

  const handleEdit = async (text: string, imageAssetId: number | null) => {
    if (!editingDraft?.id) return;
    const res = await ipc.posting?.draftUpdate({ zaloId, id: editingDraft.id, text, imageAssetId });
    if (res?.success) {
      upsertDraft({ ...editingDraft, text, image_asset_id: imageAssetId });
      showNotification('Đã lưu bài nháp', 'success');
      setEditingDraft(null);
    } else {
      showNotification(res?.error || 'Lưu thất bại', 'error');
    }
  };

  const handleGenerate = async () => {
    if (!genPillarId || generating) return;
    setGenerating(true);
    try {
      const res = await ipc.posting?.draftGenerate({ zaloId, pillarId: genPillarId as number, count: genCount });
      if (res?.success) {
        showNotification(`Đã sinh ${res.ids?.length ?? genCount} bài nháp`, 'success');
        await fetchAll(filter);
      } else {
        showNotification(res?.error || 'Sinh bài thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleBulk = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    const call = action === 'approve'
      ? (id: number) => ipc.posting?.draftApprove({ zaloId, id })
      : (id: number) => ipc.posting?.draftReject({ zaloId, id });
    const results = await Promise.allSettled(ids.map(id => call(id)));
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
    if (failed > 0) showNotification(`${failed}/${ids.length} thao tác lỗi`, 'error');
    else showNotification(`Đã ${action === 'approve' ? 'phê duyệt' : 'từ chối'} ${ids.length} bài`, 'success');
    setSelectedIds(new Set());
    await fetchAll(filter);
    setBulkBusy(false);
  };

  const toggleCheck = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Generate bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        <select value={genPillarId} onChange={e => setGenPillarId(e.target.value ? Number(e.target.value) : '')}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-blue-500">
          <option value="">-- Chọn chuyên đề --</option>
          {pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" min={1} max={10} value={genCount} onChange={e => setGenCount(Math.max(1, Math.min(10, Number(e.target.value))))}
          className="w-16 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs text-center focus:outline-none focus:border-blue-500" />
        <button onClick={handleGenerate} disabled={!genPillarId || generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0">
          {generating ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Đang sinh...</> : 'Sinh bài bằng AI'}
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(s => (
          <button key={s} onClick={() => { setFilter(s); setSelectedIds(new Set()); }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${filter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-600">{drafts.length} bài</span>
      </div>

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/20 border-b border-blue-700/30 flex-shrink-0">
          <span className="text-xs text-blue-300">Đã chọn {selectedIds.size} bài</span>
          <button onClick={() => handleBulk('approve')} disabled={bulkBusy}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-700/40 hover:bg-green-700/60 text-green-300 transition-colors disabled:opacity-50">
            Phê duyệt đã chọn
          </button>
          <button onClick={() => handleBulk('reject')} disabled={bulkBusy}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-700/40 hover:bg-red-700/60 text-red-300 transition-colors disabled:opacity-50">
            Từ chối đã chọn
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-[11px] text-gray-500 hover:text-gray-300">Bỏ chọn</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingDrafts ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Đang tải...</div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-gray-400 text-sm">Không có bài nháp nào</p>
            <p className="text-gray-600 text-xs">Sinh bài bằng AI hoặc thay đổi bộ lọc</p>
          </div>
        ) : (
          drafts.map(d => {
            const relPath = d.image_asset_id ? imageMap.get(d.image_asset_id) : undefined;
            return (
              <DraftCard
                key={d.id}
                draft={d}
                imageUrl={relPath ? toLocalMediaUrl(relPath) : null}
                checked={d.id != null && selectedIds.has(d.id)}
                onCheck={() => d.id != null && toggleCheck(d.id)}
                onApprove={() => handleApprove(d)}
                onReject={() => handleReject(d)}
                onEdit={() => setEditingDraft(d)}
                busy={bulkBusy}
              />
            );
          })
        )}
      </div>

      {/* Edit modal */}
      {editingDraft && (
        <DraftEditModal
          draft={editingDraft}
          images={imageLibrary}
          onSave={handleEdit}
          onClose={() => setEditingDraft(null)}
        />
      )}
    </div>
  );
}
