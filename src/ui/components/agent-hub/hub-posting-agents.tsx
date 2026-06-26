import React, { useState } from 'react';
import { ZaloIcon, FacebookIcon } from '@/components/common/ChannelBadge';
import AgentsTab from '@/components/posting/agents-tab';
import McAgentManager from '@/components/ai-agent-hub/mc-agent-manager';

// Hub "Agent đăng bài" — cửa sổ tổng quản agent đăng bài CẢ 2 kênh (Cách A).
// Liên thông 2 chiều: dùng lại đúng component + IPC của từng kênh, nên sửa ở Hub
// hay ở trang kênh đều ghi vào CÙNG kho dữ liệu → tự đồng bộ.
//   • Zalo → AgentsTab (posting:agent.*) — cùng dữ liệu với trang Zalo.
//   • FB   → McAgentManager (agent:mc.*) — cùng dữ liệu với trang Facebook.
// KHÔNG đụng động cơ đăng bài.

type Ch = 'zalo' | 'fb';

export default function HubPostingAgents({ zaloId }: { zaloId: string | null }) {
  const [ch, setCh] = useState<Ch>('zalo');

  const TabBtn = ({ id, icon, label }: { id: Ch; icon: React.ReactNode; label: string }) => (
    <button onClick={() => setCh(id)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${ch === id ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-700/60 flex-shrink-0">
        <span className="text-xs text-gray-500 mr-1">Kênh:</span>
        <TabBtn id="zalo" icon={<ZaloIcon size={13} />} label="Zalo" />
        <TabBtn id="fb" icon={<FacebookIcon size={13} />} label="Facebook" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {ch === 'zalo'
          ? (zaloId
              ? <div className="p-1"><AgentsTab zaloId={zaloId} /></div>
              : <div className="flex items-center justify-center h-full text-gray-500 text-sm">Chọn tài khoản Zalo ở góc trên để quản lý agent.</div>)
          : <div className="p-4"><McAgentManager /></div>}
      </div>
    </div>
  );
}
