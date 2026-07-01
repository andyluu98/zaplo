import React, { useEffect, useState } from 'react';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { usePostingStore } from '@/store/posting-store';
import AccountSelectorDropdown, { AccountOption } from '@/components/common/AccountSelectorDropdown';
import PillarsTab from './pillars-tab';
import ImageLibraryTab from './image-library-tab';
import StatsTab from './stats-tab';
import ZaloGroupsTab from './zalo-groups-tab';
import ZaloComposeTab from './zalo-compose-tab';
import PostStoreTab from '@/components/post-store/post-store-tab';
import ContentCalendarTab from '@/components/schedule/content-calendar-tab';

// Trang Zalo — bố cục theo prototype (8 tab). Phase A: tái dùng + Nhóm Zalo.
// Soạn & Đăng (Phase B) và Lịch nội dung rải bài Zalo (Phase C) đang hoàn thiện.
// Tự động hoá (agent) quản ở Hub AI & Agent — tab "→ Hub" chuyển sang đó.

type PostingTab = 'stats' | 'compose' | 'store' | 'images' | 'calendar' | 'groups' | 'pillars' | 'hub';

const TABS: Array<{ id: PostingTab; label: string }> = [
  { id: 'stats',    label: '📊 Thống kê' },
  { id: 'compose',  label: '📝 Soạn & Đăng' },
  { id: 'store',    label: '🗂️ Kho bài' },
  { id: 'images',   label: '🖼️ Thư viện ảnh' },
  { id: 'calendar', label: '📅 Lịch nội dung' },
  { id: 'groups',   label: '👥 Nhóm Zalo' },
  { id: 'pillars',  label: '🧩 Chủ đề' },
  { id: 'hub',      label: '🤖 Tự động → Hub' },
];

function NoAccountPrompt() {
  return <div className="flex-1 flex items-center justify-center"><p className="text-gray-500 text-sm">Vui lòng chọn tài khoản để tiếp tục</p></div>;
}

export default function GroupPostingPage() {
  const [activeTab, setActiveTab] = useState<PostingTab>('stats');
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();
  const setView = useAppStore(s => s.setView);
  const { clearAll, setCurrentZaloId, currentZaloId } = usePostingStore();

  const accountOptions: AccountOption[] = accounts.map(a => ({ id: a.zalo_id, name: a.full_name, phone: a.phone, avatarUrl: a.avatar_url }));

  useEffect(() => {
    if (activeAccountId !== currentZaloId) { clearAll(); setCurrentZaloId(activeAccountId); }
  }, [activeAccountId, currentZaloId, clearAll, setCurrentZaloId]);

  const onTab = (id: PostingTab) => { if (id === 'hub') setView('agentHub'); else setActiveTab(id); };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-base font-semibold text-white">💙 Zalo — Đăng bài nhóm</h1>
        <AccountSelectorDropdown options={accountOptions} activeId={activeAccountId} onSelect={setActiveAccount} />
      </div>

      <div className="flex items-center gap-0.5 px-5 pt-3 pb-0 flex-shrink-0 border-b border-gray-700/60 flex-wrap">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => onTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {!activeAccountId ? <NoAccountPrompt /> : (
          <>
            {activeTab === 'stats'    && <StatsTab zaloId={activeAccountId} />}
            {activeTab === 'compose'  && <ZaloComposeTab zaloId={activeAccountId} />}
            {activeTab === 'store'    && <PostStoreTab zaloId={activeAccountId} />}
            {activeTab === 'images'   && <ImageLibraryTab zaloId={activeAccountId} />}
            {activeTab === 'calendar' && <ContentCalendarTab />}
            {activeTab === 'groups'   && <ZaloGroupsTab zaloId={activeAccountId} />}
            {activeTab === 'pillars'  && <PillarsTab zaloId={activeAccountId} />}
          </>
        )}
      </div>
    </div>
  );
}
