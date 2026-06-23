import React, { useEffect, useState, useCallback } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import ipc from '@/lib/ipc';
import type { PostSchedule } from '@/../../src/models/automation';
import type { ZaloGroup } from '@/store/posting-store';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SCHEDULE: Omit<PostSchedule, 'owner_zalo_id'> = {
  group_ids: '[]',
  posts_per_day: 1,
  window_start: '08:00',
  window_end: '21:00',
  enabled: 0,
};

function parseGroupIds(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ─── Group checkbox row ───────────────────────────────────────────────────────

function GroupRow({ group, checked, onToggle }: {
  group: ZaloGroup; checked: boolean; onToggle: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/40 cursor-pointer transition-colors">
      <input type="checkbox" checked={checked} onChange={onToggle}
        className="w-4 h-4 rounded accent-blue-500 flex-shrink-0" />
      {group.avatar && !imgErr ? (
        <img src={toLocalMediaUrl(group.avatar)} alt={group.name}
          className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-700"
          onError={() => setImgErr(true)} />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
      )}
      <span className="text-sm text-gray-200 truncate">{group.name}</span>
    </label>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function ScheduleTab({ zaloId }: { zaloId: string }) {
  const { schedule, setSchedule, loadingSchedule, setLoadingSchedule,
          targetGroups, setTargetGroups, loadingGroups, setLoadingGroups } = usePostingStore();
  const { showNotification } = useAppStore();

  // Local form state (derived from store on load)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [postsPerDay, setPostsPerDay] = useState<number>(1);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('21:00');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [timeError, setTimeError] = useState('');

  // Sync store → local form
  const applySchedule = useCallback((s: PostSchedule | null) => {
    const src = s ?? { ...DEFAULT_SCHEDULE, owner_zalo_id: zaloId };
    setSelectedIds(parseGroupIds(src.group_ids));
    setPostsPerDay(Math.min(12, Math.max(1, src.posts_per_day)));
    setWindowStart(src.window_start ?? '08:00');
    setWindowEnd(src.window_end ?? '21:00');
    setEnabled(src.enabled === 1);
  }, [zaloId]);

  const fetchAll = useCallback(async () => {
    if (!zaloId) return;
    setLoadingSchedule(true);
    setLoadingGroups(true);
    try {
      const [schedRes, grpRes] = await Promise.all([
        ipc.posting?.scheduleGet({ zaloId }),
        ipc.posting?.groupsList({ zaloId }),
      ]);
      const sched = schedRes?.success ? schedRes.schedule : null;
      setSchedule(sched);
      applySchedule(sched);
      if (grpRes?.success) setTargetGroups(grpRes.groups ?? []);
    } catch (e) {
      console.error('[ScheduleTab] fetchAll error', e);
    } finally {
      setLoadingSchedule(false);
      setLoadingGroups(false);
    }
  }, [zaloId, setSchedule, setTargetGroups, setLoadingSchedule, setLoadingGroups, applySchedule]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Validate times on change
  useEffect(() => {
    if (windowStart && windowEnd && windowEnd <= windowStart) {
      setTimeError('Giờ kết thúc phải sau giờ bắt đầu');
    } else {
      setTimeError('');
    }
  }, [windowStart, windowEnd]);

  const handleToggleGroup = (groupId: string) => {
    setSelectedIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSave = async () => {
    if (timeError || saving || loadingSchedule) return;
    setSaving(true);
    try {
      const payload: PostSchedule = {
        owner_zalo_id: zaloId,
        group_ids: JSON.stringify(selectedIds),
        posts_per_day: postsPerDay,
        window_start: windowStart,
        window_end: windowEnd,
        enabled: enabled ? 1 : 0,
        ...(schedule?.id != null ? { id: schedule.id } : {}),
      };
      const res = await ipc.posting?.scheduleSave({ zaloId, schedule: payload });
      if (res?.success) {
        setSchedule(payload);
        showNotification('Đã lưu lịch đăng', 'success');
      } else {
        showNotification(res?.error || 'Lưu thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (togglingEnabled) return;
    setTogglingEnabled(true);
    const next = !enabled;
    try {
      const res = await ipc.posting?.scheduleEnable({ zaloId, enabled: next });
      if (res?.success) {
        setEnabled(next);
        setSchedule(schedule ? { ...schedule, enabled: next ? 1 : 0 } : null);
        showNotification(next ? 'Đã bật lịch đăng' : 'Đã tắt lịch đăng', 'success');
      } else {
        showNotification(res?.error || 'Thao tác thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setTogglingEnabled(false);
    }
  };

  const loading = loadingSchedule || loadingGroups;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">Đang tải...</div>
      ) : (
        <>
          {/* Enable toggle + save row */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60 flex-shrink-0">
            <label className="flex items-center gap-2 cursor-pointer" onClick={handleToggleEnabled}>
              <div className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-600'} ${togglingEnabled ? 'opacity-50' : ''}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-300">{enabled ? 'Lịch đăng đang bật' : 'Bật lịch đăng'}</span>
            </label>
            <button onClick={handleSave} disabled={saving || !!timeError}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Posts per day */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Số bài mỗi ngày / nhóm</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 6, 8, 12].map(n => (
                  <button key={n} type="button" onClick={() => setPostsPerDay(n)}
                    className={`w-10 h-10 rounded-xl text-sm font-semibold transition-colors ${postsPerDay === n ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300 hover:border-gray-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Time window */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Khung giờ đăng bài</label>
              <div className="flex items-center gap-3">
                <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500" />
                <span className="text-gray-500 text-sm">—</span>
                <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {timeError && <p className="text-xs text-red-400 mt-1">{timeError}</p>}
            </div>

            {/* Anti-spam note */}
            <div className="px-3 py-2.5 rounded-lg bg-gray-800/60 border border-gray-700/60">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Bot sẽ đăng tối đa {postsPerDay} bài/ngày/nhóm, giờ đăng ngẫu nhiên trong khung {windowStart}–{windowEnd} để tránh spam.
              </p>
            </div>

            {/* Group multi-select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Nhóm đăng bài</label>
                <span className="text-[11px] text-gray-500">
                  {selectedIds.length}/{targetGroups.length} nhóm đã chọn
                </span>
              </div>

              {targetGroups.length === 0 ? (
                <div className="px-3 py-4 rounded-lg bg-gray-800/60 border border-gray-700/60 text-center">
                  <p className="text-xs text-gray-500">Chưa có nhóm nào</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Nhóm xuất hiện sau khi tài khoản đồng bộ danh sách nhóm Zalo
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-700 bg-gray-800/40 divide-y divide-gray-700/60 max-h-64 overflow-y-auto">
                  {targetGroups.map(g => (
                    <GroupRow
                      key={g.groupId}
                      group={g}
                      checked={selectedIds.includes(g.groupId)}
                      onToggle={() => handleToggleGroup(g.groupId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
