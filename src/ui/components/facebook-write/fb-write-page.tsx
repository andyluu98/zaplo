import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import FbPostComposer from './fb-post-composer';
import FbGroupsManager from './fb-groups-manager';
import FbWriteLimits from './fb-write-limits';
import FbWriteLog from './fb-write-log';
import PostStoreTab from '@/components/post-store/post-store-tab';
import ContentCalendarTab from '@/components/schedule/content-calendar-tab';

// Trang "Facebook — Đăng bài & Tương tác". Tab Đăng bài đã verify chạy thật.
// Auto-Comment / Agent để placeholder (làm phase sau).

type FbTab = 'post' | 'store' | 'calendar' | 'groups' | 'comment' | 'agent' | 'log' | 'limit';

const TABS: Array<{ id: FbTab; label: string }> = [
  { id: 'post',     label: '📝 Đăng bài' },
  { id: 'store',    label: '🗂️ Kho bài' },
  { id: 'calendar', label: '📅 Lịch nội dung' },
  { id: 'groups',   label: '👥 Nhóm' },
  { id: 'comment', label: '💬 Auto-Comment' },
  { id: 'agent',   label: '🤖 Agent tự động' },
  { id: 'log',     label: '📜 Nhật ký' },
  { id: 'limit',   label: '⚙️ Giới hạn an toàn' },
];

interface FbAccount { id: string; facebook_id: string; name: string; avatar_url?: string; status?: string; }

export default function FbWritePage() {
  const [activeTab, setActiveTab] = useState<FbTab>('post');
  const [accounts, setAccounts] = useState<FbAccount[]>([]);
  const [accountId, setAccountId] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.fb?.getAccounts();
        const list: FbAccount[] = res?.success ? (res.accounts ?? []) : (Array.isArray(res) ? res : []);
        setAccounts(list);
        if (list.length && !accountId) setAccountId(list[0].facebook_id || list[0].id);
      } catch (e) { console.error('[FbWritePage] getAccounts', e); }
    })();
  }, []);

  const active = accounts.find(a => (a.facebook_id || a.id) === accountId);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-base font-semibold text-white">📘 Facebook — Đăng bài &amp; Tương tác</h1>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          {accounts.length === 0 && <option value="">Chưa có tài khoản Facebook</option>}
          {accounts.map(a => (
            <option key={a.id} value={a.facebook_id || a.id}>
              {a.name || a.facebook_id} {a.status === 'connected' ? '🟢' : '⚪'}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-0.5 px-5 pt-3 border-b border-gray-700/60 flex-shrink-0 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {!accountId ? (
          <div className="flex-1 flex items-center justify-center h-full text-gray-500 text-sm">
            Vui lòng đăng nhập 1 tài khoản Facebook (bằng Cookie) để dùng tính năng này.
          </div>
        ) : (
          <>
            {activeTab === 'post'    && <FbPostComposer accountId={accountId} accountName={active?.name || accountId} />}
            {activeTab === 'store'   && <PostStoreTab />}
            {activeTab === 'calendar' && <ContentCalendarTab />}
            {activeTab === 'groups'  && <FbGroupsManager accountId={accountId} />}
            {activeTab === 'comment' && <Placeholder text="Auto-Comment sẽ gắn với tab Quét (Scan) ở phase sau — lấy bài đã quét rồi tự bình luận." />}
            {activeTab === 'agent'   && <Placeholder text="Agent tự động (đăng theo lịch như Agent Zalo) làm ở phase sau cùng." />}
            {activeTab === 'log'     && <FbWriteLog accountId={accountId} />}
            {activeTab === 'limit'   && <FbWriteLimits />}
          </>
        )}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-md text-center text-gray-500 text-sm bg-gray-800/40 border border-gray-700/60 rounded-xl px-6 py-8">
        🚧 {text}
      </div>
    </div>
  );
}
