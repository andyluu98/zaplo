/**
 * ai-generate-modal.tsx
 * Modal "AI tạo nhiều bài" cho tab Kho bài.
 * Nhận assistants, chatFn, callback onDone khi hoàn tất.
 */

import React, { useState } from 'react';
import { generateVariations } from '@/../../src/services/facebook/write/generate-variations';
import { buildPostsFromVariations } from '@/../../src/services/post-store/build-posts';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';

interface Assistant { id: string; name: string; }

interface Props {
  assistants: Assistant[];
  onDone: () => void;
  onClose: () => void;
}

const COUNT_PRESETS = [10, 30, 50, 100];

export default function AiGenerateModal({ assistants, onDone, onClose }: Props) {
  const showNotification = useAppStore(s => s.showNotification);

  const [assistantId, setAssistantId] = useState<string>(assistants[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState<number>(10);
  const [imageMin, setImageMin] = useState<number>(1);
  const [imageMax, setImageMax] = useState<number>(3);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!topic.trim()) {
      showNotification('Vui lòng nhập chủ đề', 'error');
      return;
    }
    if (!assistantId) {
      showNotification('Vui lòng chọn trợ lý AI', 'error');
      return;
    }
    const finalCount = Math.max(1, Math.min(count, 200));
    const min = Math.max(0, imageMin);
    const max = Math.max(min, imageMax);

    setGenerating(true);
    try {
      const chatFn = async (msgs: Array<{ role: string; content: string }>) => {
        const res = await ipc.ai.chat(assistantId, msgs);
        return res?.result || '';
      };
      const texts = await generateVariations(topic.trim(), finalCount, chatFn);
      const posts = buildPostsFromVariations(texts, min, max);

      let saved = 0;
      for (const post of posts) {
        const res = await ipc.postStore.save({ post: { ...post, source: 'ai' } });
        if (res?.success) saved++;
      }
      showNotification(`Đã tạo ${saved} bài thành công`, 'success');
      onDone();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi tạo bài: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-lg mb-4">✨ AI tạo nhiều bài</h2>

        {/* Trợ lý AI */}
        <label className="block text-gray-400 text-xs mb-1">Trợ lý AI</label>
        <select
          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3"
          value={assistantId}
          onChange={e => setAssistantId(e.target.value)}
          disabled={generating}
        >
          {assistants.length === 0 && <option value="">— Chưa có trợ lý —</option>}
          {assistants.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Chủ đề */}
        <label className="block text-gray-400 text-xs mb-1">Chủ đề</label>
        <input
          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3"
          placeholder="Nhập chủ đề bài đăng..."
          value={topic}
          onChange={e => setTopic(e.target.value)}
          disabled={generating}
        />

        {/* Số lượng bài */}
        <label className="block text-gray-400 text-xs mb-1">Số lượng bài</label>
        <div className="flex gap-2 mb-3 flex-wrap">
          {COUNT_PRESETS.map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              disabled={generating}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                count === n
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={200}
            className="w-20 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-2 py-1"
            value={count}
            onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={generating}
          />
        </div>

        {/* Số ảnh */}
        <label className="block text-gray-400 text-xs mb-1">Số ảnh mỗi bài</label>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-gray-400 text-sm">Min</span>
          <input
            type="number"
            min={0}
            className="w-16 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-2 py-1"
            value={imageMin}
            onChange={e => setImageMin(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={generating}
          />
          <span className="text-gray-400 text-sm">–  Max</span>
          <input
            type="number"
            min={0}
            className="w-16 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-2 py-1"
            value={imageMax}
            onChange={e => setImageMax(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={generating}
          />
        </div>

        {/* Nút hành động */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim() || !assistantId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Đang sinh...' : 'Sinh bài'}
          </button>
        </div>
      </div>
    </div>
  );
}
