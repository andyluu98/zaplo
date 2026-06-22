import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { showConfirm } from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import type { ContentPillar } from '@/../../src/models/automation';

// ─── Form state type ──────────────────────────────────────────────────────────

interface PillarFormState {
  id?: number;
  name: string;
  description: string;
  prompt_template: string;
  tone: string;
  enabled: number;
  assistant_id: string;
}

const EMPTY_FORM: PillarFormState = {
  name: '',
  description: '',
  prompt_template: '',
  tone: '',
  enabled: 1,
  assistant_id: '',
};

interface AssistantOption { id: string; name: string; enabled?: number | boolean; }

// ─── Inline form panel ────────────────────────────────────────────────────────

function PillarForm({
  initial,
  onSave,
  onCancel,
  saving,
  assistants,
}: {
  initial: PillarFormState;
  onSave: (data: PillarFormState) => void;
  onCancel: () => void;
  saving: boolean;
  assistants: AssistantOption[];
}) {
  const [form, setForm] = useState<PillarFormState>(initial);
  const set = (k: keyof PillarFormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Insert a variable token at the caret position of the prompt textarea (or append to end).
  const insertVariable = (token: string) => {
    const el = promptRef.current;
    const current = form.prompt_template;
    if (el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const next = current.slice(0, start) + token + current.slice(end);
      set('prompt_template', next);
      // Restore caret after the inserted token on next tick.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      set('prompt_template', current + token);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">
          {form.id ? 'Chỉnh sửa chuyên đề' : 'Thêm chuyên đề'}
        </h3>
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">✕</button>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Tên chuyên đề <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="VD: Kinh doanh, Sức khỏe..."
          required
          className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Mô tả</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
          placeholder="Chủ đề này nói về..."
          className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {/* AI assistant picker — each pillar can use a different assistant/prompt */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Trợ lý AI tạo bài</label>
        <select
          value={form.assistant_id}
          onChange={e => set('assistant_id', e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">— Trợ lý mặc định —</option>
          {assistants.map(a => (
            <option key={a.id} value={a.id}>{a.name}{a.enabled ? '' : ' (đã tắt)'}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-600 mt-1">Mỗi chuyên đề có thể dùng 1 trợ lý riêng (prompt khác nhau cho từng chủ đề).</p>
      </div>

      {/* Prompt template */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Prompt AI</label>
        <textarea
          ref={promptRef}
          value={form.prompt_template}
          onChange={e => set('prompt_template', e.target.value)}
          rows={3}
          placeholder="Hướng dẫn AI tạo bài viết cho chủ đề này..."
          className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono text-xs"
        />
        {/* Insert-variable chips — click to insert token at caret */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {['{name}', '{description}', '{tone}'].map(token => (
            <button
              key={token}
              type="button"
              onClick={() => insertVariable(token)}
              className="text-[11px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-blue-500/20 hover:text-blue-300 text-gray-300 border border-gray-600 font-mono transition-colors"
            >
              {token}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-1">Biến sẽ thay bằng thông tin chủ đề khi AI viết bài.</p>
      </div>

      {/* Tone + Enabled row */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Giọng văn</label>
          <input
            type="text"
            value={form.tone}
            onChange={e => set('tone', e.target.value)}
            placeholder="VD: chuyên nghiệp, thân thiện..."
            className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mb-0.5">
          <div
            role="switch"
            aria-checked={!!form.enabled}
            onClick={() => set('enabled', form.enabled ? 0 : 1)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${form.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs text-gray-400">Bật</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
          Hủy
        </button>
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </form>
  );
}

// ─── Pillar row ───────────────────────────────────────────────────────────────

function PillarRow({ pillar, onEdit, onDelete, agentsUsing }: {
  pillar: ContentPillar;
  onEdit: (p: ContentPillar) => void;
  onDelete: (p: ContentPillar) => void;
  agentsUsing: string[];
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-white truncate">{pillar.name}</span>
          {pillar.tone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 flex-shrink-0">{pillar.tone}</span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${pillar.enabled ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
            {pillar.enabled ? 'Bật' : 'Tắt'}
          </span>
        </div>
        {pillar.description && (
          <p className="text-xs text-gray-500 truncate">{pillar.description}</p>
        )}
        {/* "Used by" badges — which posting agents reference this pillar */}
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {agentsUsing.length > 0 ? (
            <>
              <span className="text-[10px] text-gray-600">Dùng bởi:</span>
              {agentsUsing.map(name => (
                <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 flex-shrink-0">
                  {name}
                </span>
              ))}
            </>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 flex-shrink-0">
              ⚠ Chưa agent nào dùng
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(pillar)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
          title="Chỉnh sửa"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          onClick={() => onDelete(pillar)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Xóa"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function PillarsTab({ zaloId }: { zaloId: string }) {
  const { pillars, setPillars, setLoadingPillars, loadingPillars } = usePostingStore();
  const { showNotification } = useAppStore();
  const [formState, setFormState] = useState<PillarFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [agents, setAgents] = useState<Array<{ id: number; name: string; pillar_ids: number[] }>>([]);

  const fetchPillars = useCallback(async () => {
    if (!zaloId) return;
    setLoadingPillars(true);
    try {
      const res = await ipc.posting?.pillarList({ zaloId });
      if (res?.success) setPillars(res.pillars ?? []);
    } catch (e) {
      console.error('[PillarsTab] pillarList error', e);
    } finally {
      setLoadingPillars(false);
    }
  }, [zaloId, setPillars, setLoadingPillars]);

  const fetchAssistants = useCallback(async () => {
    try {
      const res = await ipc.ai?.listAssistants();
      if (res?.success) setAssistants((res.assistants ?? []).map((a: any) => ({ id: a.id, name: a.name, enabled: a.enabled })));
    } catch (e) {
      console.error('[PillarsTab] listAssistants error', e);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!zaloId) return;
    try {
      const res = await ipc.posting?.agentList({ zaloId });
      if (res?.success) {
        setAgents((res.agents ?? []).map((a: any) => ({
          id: a.id,
          name: a.name,
          pillar_ids: Array.isArray(a.pillar_ids) ? a.pillar_ids : [],
        })));
      }
    } catch (e) {
      console.error('[PillarsTab] agentList error', e);
    }
  }, [zaloId]);

  useEffect(() => { fetchPillars(); fetchAssistants(); fetchAgents(); }, [fetchPillars, fetchAssistants, fetchAgents]);

  // Map pillar id → names of agents using it.
  const agentsByPillar = React.useMemo(() => {
    const map = new Map<number, string[]>();
    for (const agent of agents) {
      for (const pid of agent.pillar_ids) {
        const arr = map.get(pid) ?? [];
        arr.push(agent.name);
        map.set(pid, arr);
      }
    }
    return map;
  }, [agents]);

  const handleSave = async (data: PillarFormState) => {
    if (!zaloId) return;
    setSaving(true);
    try {
      const pillar: ContentPillar = {
        ...(data.id != null ? { id: data.id } : {}),
        owner_zalo_id: zaloId,
        name: data.name.trim(),
        description: data.description.trim(),
        prompt_template: data.prompt_template.trim(),
        tone: data.tone.trim(),
        enabled: data.enabled,
        assistant_id: data.assistant_id || '',
      };
      const res = await ipc.posting?.pillarSave({ zaloId, pillar });
      if (res?.success) {
        showNotification('Đã lưu chuyên đề', 'success');
        setFormState(null);
        await fetchPillars();
      } else {
        showNotification(res?.error || 'Lưu thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pillar: ContentPillar) => {
    if (!pillar.id) return;
    const ok = await showConfirm({
      title: `Xóa chuyên đề "${pillar.name}"?`,
      message: 'Các bài nháp liên quan sẽ không bị xóa. Thao tác không thể hoàn tác.',
      variant: 'danger',
      confirmText: 'Xóa',
    });
    if (!ok) return;
    try {
      const res = await ipc.posting?.pillarDelete({ zaloId, id: pillar.id });
      if (res?.success) {
        showNotification('Đã xóa chuyên đề', 'success');
        await fetchPillars();
      } else {
        showNotification(res?.error || 'Xóa thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60 flex-shrink-0">
        <span className="text-xs text-gray-500">{pillars.length} chuyên đề</span>
        <button
          onClick={() => setFormState({ ...EMPTY_FORM })}
          disabled={!!formState}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Thêm chuyên đề
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Inline form */}
        {formState && (
          <PillarForm
            initial={formState}
            onSave={handleSave}
            onCancel={() => setFormState(null)}
            saving={saving}
            assistants={assistants}
          />
        )}

        {/* List */}
        {loadingPillars ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Đang tải...</div>
        ) : pillars.length === 0 && !formState ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-gray-400 text-sm">Chưa có chuyên đề nào</p>
            <p className="text-gray-600 text-xs">Thêm chuyên đề để bot AI tạo nội dung bài đăng</p>
          </div>
        ) : (
          pillars.map(p => (
            <PillarRow
              key={p.id}
              pillar={p}
              agentsUsing={p.id != null ? (agentsByPillar.get(p.id) ?? []) : []}
              onEdit={p => setFormState({ ...EMPTY_FORM, ...p, assistant_id: p.assistant_id ?? '', id: p.id })}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
