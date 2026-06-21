import React, { useEffect, useState, useCallback } from 'react';
import { useAccountStore } from '@/store/accountStore';
import { usePostingStore, BotStatus } from '@/store/posting-store';
import AccountSelectorDropdown, { AccountOption } from '@/components/common/AccountSelectorDropdown';
import PillarsTab from './pillars-tab';
import ImageLibraryTab from './image-library-tab';
import DraftsTab from './drafts-tab';
import ScheduleTab from './schedule-tab';
import ipc from '@/lib/ipc';

// ─── Tab config ───────────────────────────────────────────────────────────────

type PostingTab = 'pillars' | 'drafts' | 'schedule' | 'images';

const TABS: Array<{ id: PostingTab; label: string }> = [
  { id: 'pillars',  label: 'Chuyên đề' },
  { id: 'drafts',   label: 'Duyệt bài' },
  { id: 'schedule', label: 'Lịch đăng' },
  { id: 'images',   label: 'Thư viện ảnh' },
];

// ─── Bot status badge ─────────────────────────────────────────────────────────

function BotStatusBadge({ status }: { status: BotStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-700/60 text-gray-400 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
        Chưa kết nối
      </span>
    );
  }
  return status.running ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/40 border border-green-700/40 text-green-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      Đang chạy
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-700/60 text-gray-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
      Đã dừng
    </span>
  );
}

// ─── No-account guard ─────────────────────────────────────────────────────────

function NoAccountPrompt() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Vui lòng chọn tài khoản để tiếp tục</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GroupPostingPage() {
  const [activeTab, setActiveTab] = useState<PostingTab>('pillars');
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();
  const { botStatus, setBotStatus, clearAll, setCurrentZaloId, currentZaloId } = usePostingStore();

  const accountOptions: AccountOption[] = accounts.map(a => ({
    id: a.zalo_id,
    name: a.full_name,
    phone: a.phone,
    avatarUrl: a.avatar_url,
  }));

  // Clear store slices when active account changes to avoid stale cross-account data
  useEffect(() => {
    if (activeAccountId !== currentZaloId) {
      clearAll();
      setCurrentZaloId(activeAccountId);
    }
  }, [activeAccountId, currentZaloId, clearAll, setCurrentZaloId]);

  // Seed bot status on mount and whenever the active account changes
  useEffect(() => {
    if (!activeAccountId) return;
    ipc.posting?.botStatus({ zaloId: activeAccountId }).then(res => {
      if (res?.success && res.status) {
        setBotStatus({
          running: !!res.status.running,
          nextRunAt: res.status.nextRunAt ?? null,
          lastRunAt: res.status.lastRunAt ?? null,
          pendingDrafts: res.status.pendingDrafts,
        });
      }
    }).catch(e => console.error('[GroupPostingPage] botStatus seed error', e));
  }, [activeAccountId, setBotStatus]);

  // Subscribe to postingBot:update realtime events
  const handleBotUpdate = useCallback((data: any) => {
    if (!data) return;
    // Only apply updates for the currently active account
    if (data.zaloId && activeAccountId && data.zaloId !== activeAccountId) return;
    const next: BotStatus = {
      running: !!data.running,
      nextRunAt: data.nextRunAt ?? null,
      lastRunAt: data.lastRunAt ?? null,
      pendingDrafts: data.pendingDrafts,
    };
    setBotStatus(next);
  }, [activeAccountId, setBotStatus]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on('postingBot:update', handleBotUpdate);
    return () => { unsubscribe?.(); };
  }, [handleBotUpdate]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-white">Đăng bài nhóm</h1>
          <BotStatusBadge status={botStatus} />
        </div>

        {/* Account selector — reuse existing primitive, same pattern as CRMPage */}
        <AccountSelectorDropdown
          options={accountOptions}
          activeId={activeAccountId}
          onSelect={setActiveAccount}
        />
      </div>

      {/* ── Tab pills ── */}
      <div className="flex items-center gap-0.5 px-5 pt-3 pb-0 flex-shrink-0 border-b border-gray-700/60">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content area ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {activeTab === 'pillars' && (
          activeAccountId
            ? <PillarsTab zaloId={activeAccountId} />
            : <NoAccountPrompt />
        )}
        {activeTab === 'drafts' && (
          activeAccountId
            ? <DraftsTab zaloId={activeAccountId} />
            : <NoAccountPrompt />
        )}
        {activeTab === 'schedule' && (
          activeAccountId
            ? <ScheduleTab zaloId={activeAccountId} />
            : <NoAccountPrompt />
        )}
        {activeTab === 'images' && (
          activeAccountId
            ? <ImageLibraryTab zaloId={activeAccountId} />
            : <NoAccountPrompt />
        )}
      </div>
    </div>
  );
}
