/**
 * ReasoningPanel.tsx — shows the DeepSeek thinking chain-of-thought behind one
 * Page AI reply (Phase 5's `ai_reasoning_log`, fetched via `ipc.fbPage.getReasoning`).
 *
 * Opened from a button on an AI message bubble (ChatWindow.tsx) — the reasoning
 * itself never renders inside the chat bubble, only in this separate popup, and
 * is never sent to the customer (Phase 5 hard constraint).
 */

import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

interface ReasoningPanelProps {
  accountId: string;
  threadId: string;
  msgId?: string;
  onClose: () => void;
}

export default function ReasoningPanel({ accountId, threadId, msgId, onClose }: ReasoningPanelProps) {
  const [reasoning, setReasoning] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await ipc.fbPage.getReasoning({ accountId, threadId, msgId });
        if (cancelled) return;
        if (res.success) setReasoning(res.reasoning || '');
        else setError(res.error || 'Không lấy được chuỗi suy luận');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi không xác định');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, threadId, msgId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/60 flex-shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>🧠</span> Chuỗi suy luận của AI
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">⚠️ {error}</div>
          ) : reasoning ? (
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{reasoning}</p>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">Chưa có chuỗi suy luận lưu cho tin nhắn này.</p>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-700/60 flex-shrink-0">
          <p className="text-[10px] text-gray-500">Chỉ dùng để gỡ lỗi nội bộ — không được gửi cho khách hàng.</p>
        </div>
      </div>
    </div>
  );
}
