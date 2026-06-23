import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import InlineAssistantConfig from './inline-assistant-config';

type ReplyMode = 'auto' | 'suggest';

export default function ChatAgentEditorModal({ zaloId, agentId, onClose, onSaved }: {
  zaloId: string; agentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { showNotification } = useAppStore();
  const [groups, setGroups] = useState<Array<{ groupId: string; name: string; avatar: string }>>([]);
  const [labels, setLabels] = useState<Array<{ id: number; name: string; emoji?: string }>>([]);
  const [assistants, setAssistants] = useState<any[]>([]);
  const [gQuery, setGQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAsst, setShowAsst] = useState(false);

  // form state
  const [name, setName] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [replyMode, setReplyMode] = useState<ReplyMode>('auto');
  const [autopauseOnHuman, setAutopauseOnHuman] = useState(true);
  const [autoresumeMinutes, setAutoresumeMinutes] = useState(0);
  const [allowManualToggle, setAllowManualToggle] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [scopeDm, setScopeDm] = useState(true);
  const [scopeGroup, setScopeGroup] = useState(true);
  const [strangerOnly, setStrangerOnly] = useState(true);
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    try { const g = await ipc.posting?.groupsList({ zaloId }); if (g?.success) setGroups(g.groups ?? []); } catch (e) { console.error('[ChatAgentEditor] groups', e); }
    try { const l = await ipc.db?.getLocalLabels({ zaloId }); if (l?.success) setLabels((l.labels ?? []).map((x: any) => ({ id: x.id, name: x.name, emoji: x.emoji }))); } catch (e) { console.error('[ChatAgentEditor] labels', e); }
    try { const a = await ipc.ai?.listAssistants(); if (a?.success) setAssistants(a.assistants ?? []); } catch (e) { console.error('[ChatAgentEditor] assistants', e); }
    if (agentId) {
      try {
        const res = await ipc.chatAgent?.get({ id: agentId });
        const ag = res?.agent;
        if (ag) {
          setName(ag.name || ''); setAssistantId(ag.assistant_id || '');
          setGroupIds(ag.thread_ids || []); setLabelIds(ag.label_ids || []);
          setReplyMode(ag.reply_mode === 'suggest' ? 'suggest' : 'auto');
          setAutopauseOnHuman(ag.autopause_on_human !== 0);
          setAutoresumeMinutes(ag.autoresume_minutes || 0);
          setAllowManualToggle(ag.allow_manual_toggle !== 0);
          setIsDefault(!!ag.is_default);
          setScopeDm(ag.default_scope_dm !== 0); setScopeGroup(ag.default_scope_group !== 0);
          setStrangerOnly(ag.default_stranger_only !== 0);
          setEnabled(ag.enabled === 1);
        }
      } catch (e) { console.error('[ChatAgentEditor] get', e); }
    }
  }, [zaloId, agentId]);
  useEffect(() => { load(); }, [load]);

  const togStr = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const togNum = (arr: number[], v: number, set: (x: number[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const handleSave = async (startNow: boolean) => {
    if (saving) return;
    if (!name.trim()) { showNotification('Nhập tên agent', 'error'); return; }
    if (!isDefault && groupIds.length === 0 && labelIds.length === 0) { showNotification('Chọn ít nhất 1 nhóm hoặc 1 nhãn (hoặc đặt làm mặc định)', 'error'); return; }
    setSaving(true);
    try {
      const agent = {
        ...(agentId ? { id: agentId } : {}), owner_zalo_id: zaloId, name: name.trim(),
        assistant_id: assistantId || null, reply_mode: replyMode,
        thread_ids: groupIds, label_ids: labelIds,
        autopause_on_human: autopauseOnHuman ? 1 : 0, autoresume_minutes: autoresumeMinutes,
        allow_manual_toggle: allowManualToggle ? 1 : 0,
        is_default: isDefault ? 1 : 0, default_scope_dm: scopeDm ? 1 : 0,
        default_scope_group: scopeGroup ? 1 : 0, default_stranger_only: strangerOnly ? 1 : 0,
        enabled: (startNow || enabled) ? 1 : 0,
      };
      const res = await ipc.chatAgent?.save({ zaloId, agent });
      if (res?.success) { showNotification(startNow ? 'Đã lưu & bật agent' : 'Đã lưu agent', 'success'); onSaved(); onClose(); }
      else showNotification(res?.error || 'Lưu thất bại', 'error');
    } catch (e: any) { showNotification(e?.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  };

  const chip = (on: boolean) => `text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${on ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-gray-800 border-gray-600 text-gray-300'}`;
  const lbl = 'block text-[11px] uppercase tracking-wide text-gray-500 mt-3 mb-1';
  const fld = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500';
  const ck = (on: boolean, set: (v: boolean) => void, label: React.ReactNode) => (
    <div className="flex items-start gap-2 my-2 text-[13px] text-gray-200 cursor-pointer" onClick={() => set(!on)}>
      <span className={`w-4 h-4 rounded flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5 ${on ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-transparent'}`}>✓</span>
      <span>{label}</span>
    </div>
  );
  const fg = groups.filter(g => g.name.toLowerCase().includes(gQuery.toLowerCase()));
  const selectedAsst = assistants.find(a => String(a.id) === String(assistantId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[94%] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center px-4 py-3 border-b border-gray-700">
          <b className="text-white text-[15px]">{agentId ? 'Cấu hình Agent chat' : 'Tạo Agent chat'}</b>
          <span className="ml-auto cursor-pointer text-gray-500 text-lg" onClick={onClose}>✕</span>
        </div>
        <div className="p-4">
          <label className={lbl}>Tên agent</label>
          <input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="VD: Tư vấn thuê VP — LMak" />
          <label className={lbl}>Tài khoản Zalo</label>
          <div className={fld + ' text-gray-400'}>{zaloId}</div>

          {/* Trợ lý AI — chọn + cấu hình inline */}
          <label className={lbl}>Trợ lý AI (bộ não — KB, prompt, model)</label>
          <select className={fld} value={assistantId} onChange={e => setAssistantId(e.target.value)}>
            <option value="">— Trợ lý mặc định —</option>
            {assistants.map(a => <option key={a.id} value={a.id}>{a.name}{a.enabled ? '' : ' (tắt)'}</option>)}
          </select>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">{selectedAsst ? `${selectedAsst.platform || ''} ${selectedAsst.model || ''}` : 'Chưa chọn trợ lý riêng'}</span>
            <button className="text-xs font-semibold text-blue-400 hover:underline" onClick={() => setShowAsst(v => !v)} disabled={!assistantId}>
              {showAsst ? 'Thu gọn ▴' : '⚙️ Cấu hình tại đây ▾'}
            </button>
          </div>
          {!assistantId && <div className="text-[11px] text-gray-500 mt-1">Chọn 1 trợ lý ở trên để mở cấu hình API key / prompt / KB / model ngay tại đây.</div>}
          {showAsst && assistantId && <InlineAssistantConfig assistantId={assistantId} onSaved={(id) => setAssistantId(id)} />}

          {/* Phạm vi phụ trách */}
          <div className="mt-4 border border-gray-600/60 rounded-xl p-3 bg-gray-800/40">
            <b className="text-[13px] text-white">🧭 Phạm vi phụ trách (định tuyến)</b>
            {ck(isDefault, setIsDefault, <span><b>Đặt làm Agent mặc định</b> — tiếp nhận khách mới / hội thoại chưa gán</span>)}
            {isDefault ? (
              <div className="ml-6">
                {ck(scopeDm, setScopeDm, <span>Trả lời <b>khách nhắn DM</b></span>)}
                {ck(scopeGroup, setScopeGroup, <span>Trả lời <b>nhóm chưa gán</b> agent nào</span>)}
                {ck(strangerOnly, setStrangerOnly, <span>Chỉ áp dụng cho <b>người lạ</b> (chưa kết bạn)</span>)}
              </div>
            ) : (
              <>
                <label className={lbl}>Nhóm phụ trách ({groupIds.length})</label>
                <input className={fld + ' mb-2'} placeholder="🔎 Tìm nhóm…" value={gQuery} onChange={e => setGQuery(e.target.value)} />
                <div className="max-h-36 overflow-y-auto flex flex-wrap gap-2">
                  {groups.length === 0 ? <span className="text-xs text-gray-500">Chưa có nhóm nào đồng bộ.</span>
                    : fg.length === 0 ? <span className="text-xs text-gray-500">Không khớp "{gQuery}"</span>
                    : fg.map(g => <span key={g.groupId} className={chip(groupIds.includes(g.groupId))} onClick={() => togStr(groupIds, g.groupId, setGroupIds)}>{g.name}</span>)}
                </div>
                <label className={lbl}>Hoặc theo nhãn ({labelIds.length})</label>
                <div className="flex flex-wrap gap-2">
                  {labels.length === 0 ? <span className="text-xs text-gray-500">Chưa có nhãn local.</span>
                    : labels.map(l => <span key={l.id} className={chip(labelIds.includes(l.id))} onClick={() => togNum(labelIds, l.id, setLabelIds)}>{l.emoji || '🏷️'} {l.name}</span>)}
                </div>
              </>
            )}
          </div>

          <label className={lbl}>Chế độ trả lời</label>
          <div className="flex gap-2">
            <span className={chip(replyMode === 'auto')} onClick={() => setReplyMode('auto')}>⚡ Tự gửi</span>
            <span className={chip(replyMode === 'suggest')} onClick={() => setReplyMode('suggest')}>✍️ Chỉ gợi ý</span>
          </div>

          {/* Handoff */}
          <div className="mt-4 border border-gray-600/60 rounded-xl p-3 bg-gray-800/40">
            <b className="text-[13px] text-white">🔁 Chuyển giao Người ↔ AI</b>
            {ck(autopauseOnHuman, setAutopauseOnHuman, <span>Tự <b>ngưng AI</b> khi mình nhắn tay</span>)}
            <label className={lbl}>Tự giao lại sau (phút — 0 = tắt)</label>
            <input type="number" min={0} className={fld} value={autoresumeMinutes} onChange={e => setAutoresumeMinutes(Math.max(0, parseInt(e.target.value) || 0))} />
            {ck(allowManualToggle, setAllowManualToggle, <span>Cho bật/tắt AI <b>thủ công</b> mỗi hội thoại</span>)}
          </div>

          <label className={lbl}>Trạng thái</label>
          <div className="flex gap-2">
            <span className={chip(enabled)} onClick={() => setEnabled(true)}>Bật</span>
            <span className={chip(!enabled)} onClick={() => setEnabled(false)}>Tắt</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button className="px-4 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800" onClick={onClose}>Hủy</button>
          <button className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-200 disabled:opacity-50" disabled={saving} onClick={() => handleSave(false)}>Lưu</button>
          <button className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50" disabled={saving} onClick={() => handleSave(true)}>Lưu &amp; Bật</button>
        </div>
      </div>
    </div>
  );
}
