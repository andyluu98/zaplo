import React, { useState } from 'react';
import { useAccountStore } from '@/store/accountStore';
import AccountSelectorDropdown, { AccountOption } from '@/components/common/AccountSelectorDropdown';
import GroupPostingPage from '@/components/posting/group-posting-page';
import ChatAgentsTab from './chat-agents-tab';

type HubTab = 'posting' | 'chat';

const TABS: Array<{ id: HubTab; label: string }> = [
  { id: 'posting', label: '✒️ Agent đăng bài' },
  { id: 'chat',    label: '💬 Agent chat' },
];

function NoAccountPrompt() {
  return <div className="flex-1 flex items-center justify-center"><p className="text-gray-500 text-sm">Vui lòng chọn tài khoản để tiếp tục</p></div>;
}

export default function AgentHubPage() {
  const [activeTab, setActiveTab] = useState<HubTab>('posting');
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();

  const accountOptions: AccountOption[] = accounts.map(a => ({ id: a.zalo_id, name: a.full_name, phone: a.phone, avatarUrl: a.avatar_url }));

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-base font-semibold text-white">🤖 Quản lý Agent</h1>
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
        {/* Agent đăng bài tái dùng nguyên GroupPostingPage (có header + tab riêng của nó) */}
        {activeTab === 'posting' && <GroupPostingPage />}
        {activeTab === 'chat' && (!activeAccountId ? <NoAccountPrompt /> : <ChatAgentsTab zaloId={activeAccountId} />)}
      </div>
    </div>
  );
}
