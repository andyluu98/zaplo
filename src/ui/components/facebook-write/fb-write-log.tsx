import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

// Tab "Nhật ký": thống kê hôm nay + lịch sử hành động GHI gần đây.

const TYPE_LABEL: Record<string, string> = {
  comment: 'Comment', post_personal: 'Tường', post_group: 'Nhóm', reply_dm: 'Reply',
};

export default function FbWriteLog({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);

  const load = async () => {
    try {
      const [r, s] = await Promise.all([
        ipc.facebookWrite?.recent({ accountId, limit: 50 }),
        ipc.facebookWrite?.statsToday({ accountId }),
      ]);
      if (r?.success) setItems(r.items ?? []);
      if (s?.success) setStats(s.stats ?? []);
    } catch (e) { console.error('[FbWriteLog]', e); }
  };
  useEffect(() => { load(); }, [accountId]);

  const sum = (status: string) => stats.filter(x => x.status === status).reduce((a, x) => a + (x.c || 0), 0);
  const sent = sum('success'), failed = sum('failed');

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-3xl">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Kpi n={sent} label="Thành công (hôm nay)" color="text-green-400" />
          <Kpi n={failed} label="Lỗi (hôm nay)" color="text-red-400" />
          <Kpi n={sent + failed ? Math.round((sent / (sent + failed)) * 100) + '%' : '—'} label="Tỉ lệ thành công" color="text-blue-400" />
        </div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Nhật ký gần đây</h3>
          <button onClick={load} className="text-xs text-gray-400 hover:text-gray-200">↻ Làm mới</button>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl divide-y divide-gray-700/60">
          {items.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6">Chưa có hành động nào</div>
          ) : items.map((it, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 flex-none">{TYPE_LABEL[it.action_type] || it.action_type}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate">{it.target || '(tường)'} {it.error ? `— ${it.error}` : ''}</div>
                <div className="text-[11px] text-gray-500">{it.created_at ? new Date(it.created_at).toLocaleString('vi-VN') : ''}</div>
              </div>
              <span className={it.status === 'success' ? 'text-green-400' : 'text-red-400'}>{it.status === 'success' ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ n, label, color }: { n: any; label: string; color: string }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
      <div className={`text-2xl font-bold ${color}`}>{n}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
