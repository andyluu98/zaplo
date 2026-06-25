// Modal "Rải bài vào lịch"
// Cho phép chọn bài từ kho, khoảng ngày, giờ đăng, đích (tài khoản + nhóm)
// rồi gọi ipc.schedule.spread để lên lịch hàng loạt.

import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';

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
  const [perDay, setPerDay] = useState(1);
  const [timesRaw, setTimesRaw] = useState('08:00');

  // Tài khoản & nhóm
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

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

  function parseTimes(raw: string): string[] {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  }

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

    const times = parseTimes(timesRaw);
    if (times.length === 0) { showNotification('Nhập giờ đăng hợp lệ (vd: 08:00, 14:00)', 'error'); return; }

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
        perDay,
        times,
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
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Mỗi ngày (bài)</label>
              <input
                type="number"
                min={1}
                value={perDay}
                onChange={(e) => setPerDay(Math.max(1, Number(e.target.value)))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Giờ đăng (vd: 08:00, 14:00)</label>
              <input
                type="text"
                value={timesRaw}
                onChange={(e) => setTimesRaw(e.target.value)}
                placeholder="08:00, 14:00"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
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
              <label className="text-gray-400 text-xs mb-1 block">Nhóm đích</label>
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                {loadingGroups ? (
                  <p className="text-gray-400 text-sm p-3">Đang tải nhóm...</p>
                ) : groups.length === 0 ? (
                  <p className="text-gray-500 text-sm p-3">Không có nhóm</p>
                ) : (
                  groups.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-700/50 cursor-pointer border-b border-gray-700/50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.has(g.id)}
                        onChange={() => toggleGroup(g.id)}
                        className="accent-blue-500"
                      />
                      <span className="text-sm text-gray-200">{g.name}</span>
                    </label>
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
