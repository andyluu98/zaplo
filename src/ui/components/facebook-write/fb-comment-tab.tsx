import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

// Tab Auto-Comment: bình luận vào bài (feedback_id) — nội dung tự viết hoặc AI.
// Dùng engine comment đã verify (ipc.facebookWrite.sendApproved, actionType 'comment').
// (Lấy feedback_id tự động từ tab Quét/Scan: phase sau — hiện nhập tay/dán.)

export default function FbCommentTab({ accountId }: { accountId: string }) {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [assistantId, setAssistantId] = useState('');
  const [targets, setTargets] = useState('');   // mỗi dòng 1 feedback_id (số) hoặc base64
  const [content, setContent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => { try { const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []); } catch {} })();
  }, []);

  const aiGen = async () => {
    if (!assistantId) { setMsg('Chọn trợ lý AI để soạn comment.'); return; }
    setAiBusy(true); setMsg('');
    try {
      const prompt = content.trim() || 'Viết 1 bình luận thân thiện, ngắn gọn để tiếp cận khách hàng.';
      const r = await ipc.ai?.chat(assistantId, [{ role: 'user', content: prompt }]);
      if (r?.success && r?.result) setContent(r.result); else setMsg('AI không trả về nội dung.');
    } catch (e: any) { setMsg('Lỗi AI: ' + (e?.message || e)); }
    finally { setAiBusy(false); }
  };

  const send = async () => {
    const ids = targets.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) { setMsg('Nhập ít nhất 1 feedback_id (mỗi dòng 1 bài).'); return; }
    if (!content.trim()) { setMsg('Nhập nội dung bình luận.'); return; }
    setSending(true); setMsg('');
    try {
      const items = ids.map(t => ({ actionType: 'comment', target: t, content: content.trim() }));
      const res = await ipc.facebookWrite?.sendApproved({ accountId, items });
      const p = res?.progress;
      if (res?.success) setMsg(`Xong: ✅ ${p?.sent || 0} · ❌ ${p?.failed || 0} · ⏭️ ${p?.skipped || 0}`);
      else setMsg('Lỗi: ' + (res?.error || 'không gửi được'));
    } catch (e: any) { setMsg('Lỗi: ' + (e?.message || e)); }
    finally { setSending(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-2xl space-y-4">
        <div className="text-[12.5px] text-amber-300 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2">
          Bình luận vào bài theo <b>feedback_id</b> (mỗi dòng 1 bài). Lấy feedback_id tự động từ tab Quét/Scan sẽ bổ sung sau — hiện nhập/dán tay.
          Comment chống trùng: 1 bài đã comment sẽ bỏ qua.
        </div>
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <label className="block text-xs text-gray-400 mb-1">Bài cần comment (feedback_id, mỗi dòng 1 bài)</label>
          <textarea value={targets} onChange={e => setTargets(e.target.value)} rows={3}
            placeholder={'34842205417414461\n...'}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 font-mono" />
          <label className="block text-xs text-gray-400 mb-1 mt-3">Trợ lý AI (tùy chọn)</label>
          <select value={assistantId} onChange={e => setAssistantId(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2">
            <option value="">— Tự viết —</option>
            {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="block text-xs text-gray-400 mb-1 mt-3">Nội dung bình luận</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={3}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
          <div className="flex gap-2 mt-2">
            <button onClick={aiGen} disabled={aiBusy} className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:opacity-50">{aiBusy ? '✨ Đang viết...' : '✨ AI viết'}</button>
            <button onClick={send} disabled={sending} className="px-4 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold disabled:opacity-50">{sending ? 'Đang gửi...' : '💬 Duyệt & Comment'}</button>
          </div>
          {msg && <div className="text-sm text-gray-300 mt-2">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
