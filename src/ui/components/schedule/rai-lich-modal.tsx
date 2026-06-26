// Modal "Rải bài vào lịch"
// Cho phép chọn bài từ kho, khoảng ngày, giờ đăng, đích (tài khoản + nhóm)
// rồi gọi ipc.schedule.spread để lên lịch hàng loạt.

import React, { useEffect, useMemo, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { getFavGroups, toggleFavGroup } from '@/lib/favorite-groups';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  title: string;
  content: string;
  image_count: number;
}

interface Account {
  id: string;
  channel: 'fb' | 'zalo';
  name: string;
}

interface Group {
  id: string;
  name: string;
}

interface RaiLichModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RaiLichModal({ onClose, onSuccess }: RaiLichModalProps) {
  const showNotification = useAppStore((s) => s.showNotification);

  // Bài đăng
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectionMode, setSelectionMode] = useState<'pick' | 'random'>('pick');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [randomN, setRandomN] = useState(3);

  // Khoảng ngày & cài đặt
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [perDay, setPerDay] = useState('1');          // string để gõ tự do
  const [startTime, setStartTime] = useState('08:00'); // khung giờ rải bài
  const [endTime, setEndTime] = useState('17:00');

  // Tài khoản & nhóm
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupQuery, setGroupQuery] = useState('');
  const [favs, setFavs] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);

  // ─── Load dữ liệu ban đầu ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await ipc.postStore.list();
        if (!cancelled && res?.success) setPosts(res.posts ?? []);
      } catch {
        showNotification('Không tải được danh sách bài', 'error');
      } finally {
        if (!cancelled) setLoadingPosts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await ipc.agentMc.listAccounts();
        if (!cancelled && res?.success) setAccounts(res.accounts ?? []);
      } catch {
        showNotification('Không tải được danh sách tài khoản', 'error');
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load nhóm khi đổi tài khoản
  useEffect(() => {
    if (!selectedAccountId) { setGroups([]); return; }
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) return;

    let cancelled = false;
    setLoadingGroups(true);
    setSelectedGroupIds(new Set());
    setFavs(getFavGroups(account.id));
    setGroupQuery('');
    (async () => {
      try {
        const res = await ipc.agentMc.groups({ accountId: account.id, channel: account.channel });
        if (!cancelled && res?.success) setGroups(res.groups ?? []);
      } catch {
        showNotification('Không tải được danh sách nhóm', 'error');
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAccountId, accounts]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function togglePost(id: string) {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleFav(id: string) { setFavs(toggleFavGroup(selectedAccountId, id)); }

  // Chọn nhanh tất cả nhóm yêu thích (có trong danh sách hiện tại).
  function selectFavs() {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      groups.forEach((g) => { if (favs.has(g.id)) next.add(g.id); });
      return next;
    });
  }

  // Lọc theo từ khóa + đẩy nhóm yêu thích lên đầu.
  const visibleGroups = useMemo(() => {
    const kw = groupQuery.trim().toLowerCase();
    const list = kw ? groups.filter((g) => (g.name || '').toLowerCase().includes(kw)) : groups;
    return [...list].sort((a, b) => (favs.has(b.id) ? 1 : 0) - (favs.has(a.id) ? 1 : 0));
  }, [groups, groupQuery, favs]);

  // Danh sách giờ để sổ ra chọn (mỗi 30 phút).
  const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Xác định postIds
    let postIds: string[];
    if (selectionMode === 'random') {
      if (posts.length === 0) { showNotification('Kho bài trống', 'error'); return; }
      const n = Math.min(randomN, posts.length);
      const shuffled = [...posts].sort(() => Math.random() - 0.5);
      postIds = shuffled.slice(0, n).map((p) => p.id);
    } else {
      postIds = Array.from(selectedPostIds);
    }

    if (postIds.length === 0) { showNotification('Chọn ít nhất 1 bài', 'error'); return; }
    if (!fromDate || !toDate) { showNotification('Chọn khoảng ngày hợp lệ', 'error'); return; }
    if (fromDate > toDate) { showNotification('Ngày bắt đầu phải trước ngày kết thúc', 'error'); return; }

    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) { showNotification('Chọn tài khoản', 'error'); return; }
    if (selectedGroupIds.size === 0) { showNotification('Chọn ít nhất 1 nhóm', 'error'); return; }

    const targets = Array.from(selectedGroupIds).map((groupId) => ({
      channel: account.channel,
      accountId: account.id,
      groupId,
    }));

    setSubmitting(true);
    try {
      const res = await ipc.schedule.spread({
        postIds,
        fromDate,
        toDate,
        perDay: Math.max(1, parseInt(perDay) || 1),
        startTime,
        endTime,
        targets,
      });
      if (res?.success) {
        showNotification(`Đã lên lịch ${res.count ?? 0} bài`, 'success');
        onSuccess();
        onClose();
      } else {
        showNotification(res?.error ?? 'Rải lịch thất bại', 'error');
      }
    } catch (err: unknown) {
      showNotification(String((err as Error)?.message ?? err ?? 'Lỗi không xác định'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">Rải bài vào lịch</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Chọn bài ── */}
          <section>
            <p className="text-gray-300 text-sm font-medium mb-2">Bài đăng</p>
            <div className="flex gap-3 mb-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="selMode"
                  value="pick"
                  checked={selectionMode === 'pick'}
                  onChange={() => setSelectionMode('pick')}
                  className="accent-blue-500"
                />
                Chọn thủ công
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="selMode"
                  value="random"
                  checked={selectionMode === 'random'}
                  onChange={() => setSelectionMode('random')}
                  className="accent-blue-500"
                />
                Random
                <input
                  type="number"
                  min={1}
                  value={randomN}
                  onChange={(e) => setRandomN(Math.max(1, Number(e.target.value)))}
                  className="w-14 ml-1 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm text-white"
                  disabled={selectionMode !== 'random'}
                />
                bài
              </label>
            </div>

            {selectionMode === 'pick' && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                {loadingPosts ? (
                  <p className="text-gray-400 text-sm p-3">Đang tải...</p>
                ) : posts.length === 0 ? (
                  <p className="text-gray-500 text-sm p-3">Kho bài trống</p>
                ) : (
                  posts.map((post) => (
                    <label
                      key={post.id}
                      className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-700/50 cursor-pointer border-b border-gray-700/50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPostIds.has(post.id)}
                        onChange={() => togglePost(post.id)}
                        className="mt-0.5 accent-blue-500 shrink-0"
                      />
                      <span className="text-sm text-gray-200 leading-snug line-clamp-2">
                        {post.title || post.content?.slice(0, 80) || `Bài #${post.id}`}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </section>

          {/* ── Khoảng ngày ── */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Từ ngày</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Đến ngày</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </section>

          {/* ── perDay & giờ ── */}
          <section className="grid grid-cols-2 gap-3 items-start">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Mỗi ngày (bài)</label>
              <input
                type="number"
                min={1}
                value={perDay}
                onChange={(e) => setPerDay(e.target.value)}
                onBlur={() => setPerDay(String(Math.max(1, parseInt(perDay) || 1)))}
                placeholder="Nhập số bài/ngày"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Khung giờ đăng (rải ngẫu nhiên trong khung)</label>
              <div className="flex items-center gap-2">
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-gray-400 text-sm">→</span>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">VD: 08:00 → 11:00, mỗi ngày {Math.max(1, parseInt(perDay) || 1)} bài rải đều giờ khác nhau.</p>
            </div>
          </section>

          {/* ── Tài khoản ── */}
          <section>
            <label className="text-gray-400 text-xs mb-1 block">Tài khoản đăng</label>
            {loadingAccounts ? (
              <p className="text-gray-400 text-sm">Đang tải...</p>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Chọn tài khoản --</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.channel.toUpperCase()}] {acc.name}
                  </option>
                ))}
              </select>
            )}
          </section>

          {/* ── Nhóm ── */}
          {selectedAccountId && (
            <section>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-400 text-xs">Nhóm đích</label>
                {favs.size > 0 && (
                  <button onClick={selectFavs} className="text-[11px] text-amber-400 hover:underline">⭐ Chọn nhóm yêu thích</button>
                )}
              </div>
              <input
                type="text"
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                placeholder="🔍 Tìm nhóm theo tên…"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:outline-none focus:border-blue-500"
              />
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                {loadingGroups ? (
                  <p className="text-gray-400 text-sm p-3">Đang tải nhóm...</p>
                ) : groups.length === 0 ? (
                  <p className="text-gray-500 text-sm p-3">Không có nhóm</p>
                ) : visibleGroups.length === 0 ? (
                  <p className="text-gray-500 text-sm p-3">Không có nhóm khớp từ khóa</p>
                ) : (
                  visibleGroups.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-700/50 border-b border-gray-700/50 last:border-b-0"
                    >
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.has(g.id)}
                          onChange={() => toggleGroup(g.id)}
                          className="accent-blue-500 shrink-0"
                        />
                        <span className="text-sm text-gray-200 truncate">{g.name}</span>
                      </label>
                      <button
                        onClick={() => toggleFav(g.id)}
                        title={favs.has(g.id) ? 'Bỏ yêu thích' : 'Đánh dấu nhóm hay đăng'}
                        className={`text-base shrink-0 ${favs.has(g.id) ? 'text-amber-400' : 'text-gray-600 hover:text-amber-300'}`}
                      >
                        {favs.has(g.id) ? '★' : '☆'}
                      </button>
                    </div>
                  ))
                )}
              </div>
              {selectedGroupIds.size > 0 && (
                <p className="text-xs text-blue-400 mt-1">Đã chọn {selectedGroupIds.size} nhóm</p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
          >
            {submitting ? 'Đang rải...' : 'Rải lịch'}
          </button>
        </div>
      </div>
    </div>
  );
}
