import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';

// Khối "Cấu hình trợ lý INLINE" — render lại các field chính của trợ lý (không nhảy trang).
// Gọi thẳng ipc.ai.getAssistant / saveAssistant. Lưu xong trả assistantId về cha qua onSaved.
const PLATFORMS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5-mini'] },
  { value: 'gemini', label: 'Google Gemini', models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview'] },
  { value: 'claude', label: 'Anthropic Claude', models: ['claude-4.6-sonnet-20260301', 'claude-4.0-haiku-20260101'] },
  { value: 'deepseek', label: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'] },
];

export default function InlineAssistantConfig({ assistantId, onSaved }: { assistantId: string; onSaved: (id: string) => void }) {
  const { showNotification } = useAppStore();
  const [savedId, setSavedId] = useState<string>(assistantId || '');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('deepseek');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [contextMessageCount, setContextMessageCount] = useState(30);
  const [files, setFiles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!assistantId) return;
    try {
      const res = await ipc.ai?.getAssistant(assistantId);
      if (res?.success && res.assistant) {
        const a = res.assistant;
        setName(a.name || ''); setPlatform(a.platform || 'deepseek'); setModel(a.model || 'deepseek-v4-flash');
        setApiKey(a.apiKey || ''); setSystemPrompt(a.systemPrompt || '');
        setTemperature(a.temperature ?? 0.7); setMaxTokens(a.maxTokens || 1000);
        setContextMessageCount(a.contextMessageCount || 30);
      }
      const fr = await ipc.ai?.getFiles(assistantId);
      if (fr?.success) setFiles(fr.files || []);
    } catch (e) { console.error('[InlineAssistantConfig] load', e); }
  }, [assistantId]);
  useEffect(() => { load(); }, [load]);

  const platformModels = PLATFORMS.find(p => p.value === platform)?.models || [];

  const save = async () => {
    if (saving) return;
    if (!name.trim()) { showNotification('Nhập tên trợ lý', 'error'); return; }
    if (!apiKey && !savedId) { showNotification('Nhập API Key', 'error'); return; }
    setSaving(true);
    try {
      const payload: any = {
        id: savedId || undefined, name: name.trim(), platform, model,
        apiKey: apiKey || '***', systemPrompt: systemPrompt.trim(),
        temperature, maxTokens, contextMessageCount, enabled: true,
      };
      const res = await ipc.ai?.saveAssistant(payload);
      if (res?.success && res.id) { setSavedId(res.id); onSaved(res.id); showNotification('Đã lưu trợ lý', 'success'); }
      else showNotification(res?.error || 'Lưu trợ lý thất bại', 'error');
    } catch (e: any) { showNotification(e?.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  };

  const upload = async () => {
    if (!savedId) { showNotification('Lưu trợ lý trước khi tải file', 'warning'); return; }
    try {
      const res = await ipc.file?.openDialog({ title: 'Chọn file kiến thức', filters: [{ name: 'Văn bản', extensions: ['txt', 'md', 'csv', 'json'] }], properties: ['openFile', 'multiSelections'] });
      if (!res?.filePaths?.length) return;
      for (const fp of res.filePaths) await ipc.ai?.uploadFile(savedId, fp);
      const fr = await ipc.ai?.getFiles(savedId); if (fr?.success) setFiles(fr.files || []);
      showNotification('Đã tải file lên', 'success');
    } catch (e: any) { showNotification('Lỗi upload: ' + e.message, 'error'); }
  };
  const removeFile = async (id: number) => { try { await ipc.ai?.removeFile(id); setFiles(p => p.filter(f => f.id !== id)); } catch {} };

  const lbl = 'block text-[11px] uppercase tracking-wide text-gray-500 mt-3 mb-1';
  const fld = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500';

  return (
    <div className="mt-3 border border-gray-600/60 rounded-xl p-3 bg-gray-800/40">
      <div className="flex items-center justify-between">
        <b className="text-[13px] text-white">⚙️ Cấu hình trợ lý (ngay tại đây — không nhảy trang)</b>
        <button className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 text-white disabled:opacity-50" disabled={saving} onClick={save}>Lưu trợ lý</button>
      </div>
      <label className={lbl}>Tên trợ lý</label>
      <input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="VD: Trợ lý tư vấn bán hàng" />
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Nền tảng</label>
          <select className={fld} value={platform} onChange={e => { setPlatform(e.target.value); const m = PLATFORMS.find(p => p.value === e.target.value)?.models[0]; if (m) setModel(m); }}>
            {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div><label className={lbl}>Model</label>
          <select className={fld} value={model} onChange={e => setModel(e.target.value)}>{platformModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>
      <label className={lbl}>🔑 API Key</label>
      <div className="flex gap-2">
        <input className={fld} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={savedId ? '•••• (để trống = giữ cũ)' : 'Nhập API Key…'} />
        <button className="px-3 rounded-lg bg-gray-700 text-gray-300 text-sm" onClick={() => setShowKey(v => !v)}>{showKey ? '🙈' : '👁'}</button>
      </div>
      <label className={lbl}>💬 System Prompt</label>
      <textarea className={fld + ' min-h-[80px] resize-y'} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="VD: Bạn là trợ lý tư vấn…" />
      <label className={lbl}>📚 File kiến thức (KB)</label>
      {files.map(f => (
        <div key={f.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs mb-1.5">📄 {f.fileName}<span className="ml-auto text-red-400 cursor-pointer" onClick={() => removeFile(f.id)}>✕</span></div>
      ))}
      <button onClick={upload} disabled={!savedId} className="w-full py-2 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg text-xs text-gray-400 hover:text-blue-400 disabled:opacity-50">{savedId ? '📎 Chọn file (TXT, MD, CSV, JSON)' : '💾 Lưu trợ lý trước'}</button>
      <div className="flex items-center justify-between mt-3"><label className="text-xs text-gray-400">Temperature</label><span className="text-xs text-white font-mono">{temperature.toFixed(1)}</span></div>
      <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-blue-500" />
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Max tokens</label><input type="number" className={fld} value={maxTokens} onChange={e => setMaxTokens(Math.max(50, parseInt(e.target.value) || 1000))} /></div>
        <div><label className={lbl}>Số tin ngữ cảnh</label><input type="number" className={fld} value={contextMessageCount} onChange={e => setContextMessageCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 30)))} /></div>
      </div>
    </div>
  );
}
