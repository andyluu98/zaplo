import React, { useState } from 'react';
import { toLocalMediaUrl } from '@/lib/localMedia';
import type { ContentDraft, ImageAsset } from '@/../../src/models/automation';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DraftEditModalProps {
  draft: ContentDraft;
  images: ImageAsset[];
  onSave: (text: string, imageAssetId: number | null) => Promise<void>;
  onClose: () => void;
}

// ─── Small image picker tile ──────────────────────────────────────────────────

function ImagePickerTile({
  asset,
  selected,
  onSelect,
}: {
  asset: ImageAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors focus:outline-none ${
        selected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      {errored ? (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9l4-4 4 4 4-4 4 4" /><path d="M3 15l4 4 4-4 4 4" />
          </svg>
        </div>
      ) : (
        <img
          src={toLocalMediaUrl(asset.rel_path)}
          alt={asset.rel_path}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      )}
      {selected && (
        <span className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function DraftEditModal({ draft, images, onSave, onClose }: DraftEditModalProps) {
  const [text, setText] = useState(draft.text);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(draft.image_asset_id ?? null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim(), selectedImageId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">Chỉnh sửa bài nháp</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Text */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nội dung bài <span className="text-red-400">*</span></label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={6}
                required
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Nội dung bài đăng..."
              />
            </div>

            {/* Image picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Chọn ảnh (tuỳ chọn)</label>
                {selectedImageId !== null && (
                  <button type="button" onClick={() => setSelectedImageId(null)} className="text-[10px] text-red-400 hover:text-red-300">
                    Bỏ ảnh
                  </button>
                )}
              </div>
              {images.length === 0 ? (
                <p className="text-xs text-gray-600">Thư viện ảnh trống. Tải ảnh lên ở tab Thư viện ảnh.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                  {images.map(asset => (
                    <ImagePickerTile
                      key={asset.id}
                      asset={asset}
                      selected={selectedImageId === asset.id}
                      onSelect={() => setSelectedImageId(asset.id === selectedImageId ? null : (asset.id ?? null))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
