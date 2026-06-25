import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { expandQueue, type Draft, type Target } from '@/../../src/services/facebook/write/expand-queue';
import { generateVariations } from '@/../../src/services/facebook/write/generate-variations';

// Tab "Đăng bài": soạn (tự/AI) → chọn Tường + nhiều nhóm (theo tên) → hàng đợi → duyệt & đăng.
// 1 bài → nhiều đích nhờ expandQueue. Gọi ipc.facebookWrite.sendApproved (engine đã verify).

interface QueueItem { actionType: 'post_personal' | 'post_group'; target: string; content: string; label: string; }
interface Progress { total: number; done: number; sent: number; failed: number; skipped: number; stoppedReason?: string; }
interface SavedGroup { group_id: string; name: string; }

export default function FbPostComposer({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [assistantId, setAssistantId] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(3);
  const [variations, setVariations] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'EVERYONE' | 'FRIENDS' | 'SELF'>('EVERYONE');
  const [postToWall, setPostToWall] = useState(true);
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => { try { const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []); } catch {} })();
  }, []);

  // Tải nhóm đã lưu (chọn theo tên)
  useEffect(() => {
    (async () => { try { const r = await ipc.facebookWrite?.groupList({ accountId }); if (r?.success) setGroups(r.groups ?? []); } catch {} })();
  }, [accountId]);

  const toggleGroup = (id: string) => setSelectedGroups(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

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

  const buildTargets = (): Target[] => {
    const targets: Target[] = [];
    if (postToWall) targets.push({ kind: 'wall', id: '', name: `Tường (${privacy})` });
    for (const id of selectedGroups) {
      const g = groups.find(x => x.group_id === id);
      targets.push({ kind: 'group', id, name: g?.name || `Nhóm ${id}` });
    }
    return targets;
  };

  const generateBulk = async () => {
    if (!assistantId) { setMsg('Chọn trợ lý AI để sinh nhiều bài.'); return; }
    if (!topic.trim()) { setMsg('Nhập chủ đề.'); return; }
    setAiBusy(true); setMsg('');
    try {
      const chatFn = async (messages: any[]) => {
        const res = await ipc.ai?.chat(assistantId, messages);
        return (res?.success && res?.result) ? res.result : '';
      };
      const list = await generateVariations(topic.trim(), count, chatFn);
      if (list.length) setVariations(list); else setMsg('AI không sinh được bài nào.');
    } catch (e: any) { setMsg('Lỗi AI: ' + (e?.message || e)); }
    finally { setAiBusy(false); }
  };

  const addToQueue = () => {
    const targets = buildTargets();
    if (!targets.length) { setMsg('Chọn ít nhất 1 đích (Tường hoặc nhóm).'); return; }
    let drafts: Draft[];
    if (mode === 'bulk') {
      drafts = variations.map(v => ({ content: v })).filter(d => d.content.trim());
      if (!drafts.length) { setMsg('Chưa có bài nào (bấm "AI sinh" trước).'); return; }
    } else {
      const text = content.trim();
      if (!text) { setMsg('Nhập nội dung trước.'); return; }
      drafts = [{ content: text }];
    }
    const items = expandQueue(drafts, targets) as QueueItem[];
    setQueue(q => [...q, ...items]);
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Soạn nội dung</h3>
              <div className="flex gap-1 text-xs">
                <button onClick={() => setMode('single')} className={`px-2.5 py-1 rounded-lg ${mode === 'single' ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-600 text-gray-300'}`}>1 bài</button>
                <button onClick={() => setMode('bulk')} className={`px-2.5 py-1 rounded-lg ${mode === 'bulk' ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-600 text-gray-300'}`}>Nhiều bài</button>
              </div>
            </div>
            <label className="block text-xs text-gray-400 mb-1">Trợ lý AI {mode === 'bulk' ? '(bắt buộc để sinh)' : '(tùy chọn)'}</label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3">
              <option value="">— Tự viết —</option>
              {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {mode === 'single' ? (
              <>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                  placeholder="Nhập nội dung bài đăng, hoặc gõ gợi ý rồi bấm 'AI viết giúp'..."
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 resize-y" />
                <button onClick={aiGenerate} disabled={aiBusy}
                  className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:opacity-50">
                  {aiBusy ? '✨ Đang viết...' : '✨ AI viết giúp'}
                </button>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Chủ đề (vd: ưu đãi khai giảng tháng 7)"
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2" />
                  <select value={count} onChange={e => setCount(Number(e.target.value))}
                    className="bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-2 py-2">
                    {[2, 3, 5, 8, 10].map(n => <option key={n} value={n}>{n} bài</option>)}
                  </select>
                </div>
                <button onClick={generateBulk} disabled={aiBusy}
                  className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:opacity-50">
                  {aiBusy ? '✨ Đang sinh...' : `✨ AI sinh ${count} bài`}
                </button>
                {variations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {variations.map((v, i) => (
                      <div key={i} className="relative">
                        <textarea value={v} rows={3}
                          onChange={e => setVariations(arr => arr.map((x, idx) => idx === i ? e.target.value : x))}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 resize-y" />
                        <button onClick={() => setVariations(arr => arr.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 text-gray-500 hover:text-red-400 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Đăng tới đâu (chọn nhiều)</h3>
            {/* Tường */}
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={postToWall} onChange={e => setPostToWall(e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-gray-200">👤 Tường cá nhân</span>
              {postToWall && (
                <select value={privacy} onChange={e => setPrivacy(e.target.value as any)}
                  className="ml-auto bg-gray-900 border border-gray-600 rounded-lg text-white text-xs px-2 py-1">
                  <option value="EVERYONE">Công khai</option>
                  <option value="FRIENDS">Bạn bè</option>
                  <option value="SELF">Chỉ mình tôi</option>
                </select>
              )}
            </label>
            {/* Nhóm */}
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">👥 Nhóm ({selectedGroups.length}/{groups.length} chọn)</label>
            </div>
            {groups.length === 0 ? (
              <div className="text-[11px] text-gray-500 border border-dashed border-gray-700 rounded-lg px-3 py-2">
                Chưa có nhóm. Vào tab <b>👥 Nhóm</b> để lưu nhóm (theo tên) trước.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-700 bg-gray-900 divide-y divide-gray-700/60 max-h-40 overflow-y-auto">
                {groups.map(g => (
                  <label key={g.group_id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-700/30">
                    <input type="checkbox" checked={selectedGroups.includes(g.group_id)} onChange={() => toggleGroup(g.group_id)} className="w-4 h-4 accent-blue-500" />
                    <span className="text-sm text-gray-200 truncate">{g.name}</span>
                  </label>
                ))}
              </div>
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
