import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { parseGroupId } from '@/../../src/services/facebook/write/parse-group-id';

// Tab "Đăng bài": soạn (tự/AI) → chọn Tường/Nhóm → hàng đợi → duyệt & đăng.
// Gọi ipc.facebookWrite.previewBatch + sendApproved (engine đã verify chạy thật).

interface QueueItem { actionType: 'post_personal' | 'post_group'; target: string; content: string; label: string; }
interface Progress { total: number; done: number; sent: number; failed: number; skipped: number; stoppedReason?: string; }

export default function FbPostComposer({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [assistantId, setAssistantId] = useState('');
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<'wall' | 'group'>('wall');
  const [privacy, setPrivacy] = useState<'EVERYONE' | 'FRIENDS' | 'SELF'>('EVERYONE');
  const [groupInput, setGroupInput] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => { try { const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []); } catch {} })();
  }, []);

  // Lắng nghe tiến độ gửi loạt
  useEffect(() => {
    const h = (_e: any, p: Progress) => setProgress(p);
    ipc.on?.('facebook:write:progress', h);
    return () => ipc.removeAllListeners?.('facebook:write:progress');
  }, []);

  const aiGenerate = async () => {
    if (!assistantId) { setMsg('Chọn trợ lý AI trước, hoặc tự nhập nội dung.'); return; }
    setAiBusy(true); setMsg('');
    try {
      const prompt = content.trim() || 'Viết 1 bài đăng Facebook ngắn gọn, hấp dẫn.';
      const res = await ipc.ai?.chat(assistantId, [{ role: 'user', content: prompt }]);
      const text = (res?.success && res?.result) ? res.result : '';
      if (text) setContent(text); else setMsg('AI không trả về nội dung' + (res?.error ? ': ' + res.error : '.'));
    } catch (e: any) { setMsg('Lỗi AI: ' + (e?.message || e)); }
    finally { setAiBusy(false); }
  };

  const addToQueue = () => {
    const text = content.trim();
    if (!text) { setMsg('Nhập nội dung trước.'); return; }
    if (channel === 'wall') {
      setQueue(q => [...q, { actionType: 'post_personal', target: '', content: text, label: `Tường (${privacy})` }]);
    } else {
      const gid = parseGroupId(groupInput);
      if (!gid) { setMsg('Nhập ID nhóm (số) hoặc link facebook.com/groups/<id>.'); return; }
      setQueue(q => [...q, { actionType: 'post_group', target: gid, content: text, label: `Nhóm ${gid}` }]);
    }
    setMsg('');
  };

  const removeItem = (i: number) => setQueue(q => q.filter((_, idx) => idx !== i));

  const sendAll = async () => {
    if (!queue.length || sending) return;
    setSending(true); setProgress(null); setMsg('');
    try {
      const items = queue.map(q => ({ actionType: q.actionType, target: q.target, content: q.content, label: q.label }));
      const res = await ipc.facebookWrite?.sendApproved({ accountId, items });
      if (res?.success) {
        const p = res.progress;
        setProgress(p);
        setMsg(`Xong: ✅ ${p?.sent || 0} thành công · ❌ ${p?.failed || 0} lỗi · ⏭️ ${p?.skipped || 0} bỏ qua${p?.stoppedReason ? ' · ' + p.stoppedReason : ''}`);
        setQueue([]);
      } else { setMsg('Lỗi: ' + (res?.error || 'không gửi được')); }
    } catch (e: any) { setMsg('Lỗi: ' + (e?.message || e)); }
    finally { setSending(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cột soạn */}
        <div className="space-y-4">
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Soạn nội dung</h3>
            <label className="block text-xs text-gray-400 mb-1">Trợ lý AI (tùy chọn)</label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3">
              <option value="">— Tự viết —</option>
              {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
              placeholder="Nhập nội dung bài đăng, hoặc gõ gợi ý rồi bấm 'AI viết giúp'..."
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 resize-y" />
            <button onClick={aiGenerate} disabled={aiBusy}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:opacity-50">
              {aiBusy ? '✨ Đang viết...' : '✨ AI viết giúp'}
            </button>
          </div>

          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Đăng tới đâu</h3>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setChannel('wall')}
                className={`px-4 py-2 rounded-lg text-sm border ${channel === 'wall' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-900 border-gray-600 text-gray-300'}`}>👤 Tường cá nhân</button>
              <button onClick={() => setChannel('group')}
                className={`px-4 py-2 rounded-lg text-sm border ${channel === 'group' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-900 border-gray-600 text-gray-300'}`}>👥 Nhóm</button>
            </div>
            {channel === 'wall' ? (
              <>
                <label className="block text-xs text-gray-400 mb-1">Quyền riêng tư</label>
                <select value={privacy} onChange={e => setPrivacy(e.target.value as any)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2">
                  <option value="EVERYONE">Công khai</option>
                  <option value="FRIENDS">Bạn bè</option>
                  <option value="SELF">Chỉ mình tôi</option>
                </select>
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-400 mb-1">ID nhóm hoặc link (facebook.com/groups/...)</label>
                <input value={groupInput} onChange={e => setGroupInput(e.target.value)} placeholder="vd: 1870942289894981"
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
              </>
            )}
            <button onClick={addToQueue} className="mt-3 w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">➕ Thêm vào hàng đợi</button>
          </div>
        </div>

        {/* Cột hàng đợi */}
        <div className="space-y-4">
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Hàng đợi chờ duyệt</h3>
              <span className="text-xs text-gray-500">{queue.length} mục</span>
            </div>
            {queue.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-700 rounded-lg">Chưa có gì trong hàng đợi</div>
            ) : (
              <div className="space-y-2">
                {queue.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-900 border border-gray-700 rounded-lg p-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full flex-none ${q.actionType === 'post_group' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/15 text-blue-300'}`}>{q.actionType === 'post_group' ? 'Nhóm' : 'Tường'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{q.content}</div>
                      <div className="text-[11px] text-gray-500">{q.label}</div>
                    </div>
                    <button onClick={() => removeItem(i)} className="text-gray-500 hover:text-red-400 text-xs flex-none">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-[11px] text-amber-300/80 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2">
              ⏱️ Đăng tuần tự, mỗi bài cách 4–9s ngẫu nhiên để an toàn nick. Vượt giới hạn/ngày sẽ tự dừng.
            </div>
            <button onClick={sendAll} disabled={sending || queue.length === 0}
              className="mt-3 w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50">
              {sending ? '⏳ Đang đăng...' : '✅ Duyệt & Đăng tất cả'}
            </button>
          </div>

          {(progress || msg) && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">Kết quả</h3>
              {progress && (
                <div className="h-2 bg-gray-900 border border-gray-700 rounded mb-2 overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                </div>
              )}
              {msg && <div className="text-sm text-gray-300">{msg}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
