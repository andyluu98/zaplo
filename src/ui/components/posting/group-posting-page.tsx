import React, { useEffect, useState } from 'react';
import { useAccountStore } from '@/store/accountStore';
import { usePostingStore } from '@/store/posting-store';
import AccountSelectorDropdown, { AccountOption } from '@/components/common/AccountSelectorDropdown';
import AgentsTab from './agents-tab';
import CalendarTab from './calendar-tab';
import PillarsTab from './pillars-tab';
import ImageLibraryTab from './image-library-tab';
import DraftsTab from './drafts-tab';
import StatsTab from './stats-tab';

type PostingTab = 'agents' | 'calendar' | 'drafts' | 'pillars' | 'images' | 'stats';

const TABS: Array<{ id: PostingTab; label: string }> = [
  { id: 'agents',   label: '🤖 Agents' },
  { id: 'calendar', label: '📅 Lịch' },
  { id: 'drafts',   label: '📝 Bài đăng' },
  { id: 'pillars',  label: '🧩 Chủ đề' },
  { id: 'images',   label: '🖼️ Thư viện ảnh' },
  { id: 'stats',    label: '📊 Thống kê' },
];

function NoAccountPrompt() {
  return <div className="flex-1 flex items-center justify-center"><p className="text-gray-500 text-sm">Vui lòng chọn tài khoản để tiếp tục</p></div>;
}

export default function GroupPostingPage() {
  const [activeTab, setActiveTab] = useState<PostingTab>('agents');
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();
  const { clearAll, setCurrentZaloId, currentZaloId } = usePostingStore();

  const accountOptions: AccountOption[] = accounts.map(a => ({ id: a.zalo_id, name: a.full_name, phone: a.phone, avatarUrl: a.avatar_url }));

  useEffect(() => {
    if (activeAccountId !== currentZaloId) { clearAll(); setCurrentZaloId(activeAccountId); }
  }, [activeAccountId, currentZaloId, clearAll, setCurrentZaloId]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-base font-semibold text-white">Đăng bài nhóm</h1>
        <AccountSelectorDropdown options={accountOptions} activeId={activeAccountId} onSelect={setActiveAccount} />
      </div>

      <div className="flex items-center gap-0.5 px-5 pt-3 pb-0 flex-shrink-0 border-b border-gray-700/60 flex-wrap">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {!activeAccountId ? <NoAccountPrompt /> : (
          <>
            {activeTab === 'agents'   && <AgentsTab zaloId={activeAccountId} />}
            {activeTab === 'calendar' && <CalendarTab zaloId={activeAccountId} />}
            {activeTab === 'drafts'   && <DraftsTab zaloId={activeAccountId} />}
            {activeTab === 'pillars'  && <PillarsTab zaloId={activeAccountId} />}
            {activeTab === 'images'   && <ImageLibraryTab zaloId={activeAccountId} />}
            {activeTab === 'stats'    && <StatsTab zaloId={activeAccountId} />}
          </>
        )}
      </div>
    </div>
  );
}
