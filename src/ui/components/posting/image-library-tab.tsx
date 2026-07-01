import React, { useEffect, useCallback, useState } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { showConfirm } from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import ipc from '@/lib/ipc';
import type { ImageAsset } from '@/../../src/models/automation';

// ─── Thumbnail tile ───────────────────────────────────────────────────────────

function ImageTile({ asset, onDelete, onOpen }: { asset: ImageAsset; onDelete: (a: ImageAsset) => void; onOpen: (src: string) => void }) {
  const [errored, setErrored] = useState(false);
  const src = toLocalMediaUrl(asset.rel_path);

  return (
    <div className="relative group aspect-square rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
      {errored ? (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/><path d="M3 15l4 4 4-4 4 4"/></svg>
        </div>
      ) : (
        <img
          src={src}
          alt={asset.rel_path}
          onClick={() => onOpen(src)}
          className="w-full h-full object-cover cursor-zoom-in"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      )}

      {/* Origin badge */}
      <span className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${
        asset.origin === 'ai' ? 'bg-purple-600/80 text-white' : 'bg-gray-800/80 text-gray-300'
      }`}>
        {asset.origin === 'ai' ? 'AI' : 'Upload'}
      </span>

      {/* Delete button — shown on hover */}
      <button
        onClick={() => onDelete(asset)}
        className="absolute top-1 right-1 w-6 h-6 rounded-md bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Xóa ảnh"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      {/* Dimensions */}
      {asset.width && asset.height && (
        <span className="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded bg-black/50 text-gray-300 leading-none">
          {asset.width}×{asset.height}
        </span>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function ImageLibraryTab({ zaloId }: { zaloId: string }) {
  const { imageLibrary, setImageLibrary, loadingImages, setLoadingImages } = usePostingStore();
  const { showNotification } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [originFilter, setOriginFilter] = useState<'all' | 'ai' | 'upload'>('all');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    if (!zaloId) return;
    setLoadingImages(true);
    try {
      const res = await ipc.posting?.imageList({ zaloId });
      if (res?.success) setImageLibrary(res.assets ?? []);
    } catch (e) {
      console.error('[ImageLibraryTab] imageList error', e);
    } finally {
      setLoadingImages(false);
    }
  }, [zaloId, setImageLibrary, setLoadingImages]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleUpload = async () => {
    if (!zaloId || uploading) return;
    // Signature: openDialog({ filters, multiSelect }) → { success, filePaths, canceled }
    const result = await ipc.file?.openDialog({
      multiSelect: true,
      filters: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (!result?.success || result.canceled || !result.filePaths?.length) return;

    setUploading(true);
    try {
      const results = await Promise.allSettled(
        result.filePaths.map((filePath: string) =>
          ipc.posting?.imageUpload({ zaloId, filePath })
        )
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
      const ok = results.length - failed;
      if (ok > 0) showNotification(`Đã tải lên ${ok} ảnh`, 'success');
      if (failed > 0) showNotification(`${failed} ảnh thất bại`, 'error');
      await fetchImages();
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi tải ảnh', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: ImageAsset) => {
    if (!asset.id) return;
    const ok = await showConfirm({
      title: 'Xóa ảnh này?',
      message: 'Thao tác không thể hoàn tác.',
      variant: 'danger',
      confirmText: 'Xóa',
    });
    if (!ok) return;
    try {
      const res = await ipc.posting?.imageDelete({ zaloId, ids: [asset.id] });
      if (res?.success) {
        showNotification('Đã xóa ảnh', 'success');
        await fetchImages();
      } else {
        showNotification(res?.error || 'Xóa thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  const handleGenerateAI = async () => {
    if (!zaloId || !aiPrompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await ipc.posting?.imageGenerate({ zaloId, prompt: aiPrompt.trim() });
      if (res?.success) {
        showNotification('Đã tạo ảnh AI thành công', 'success');
        setAiPrompt('');
        await fetchImages();
      } else {
        showNotification(res?.error || 'Tạo ảnh thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Client-side filter by origin.
  const filteredImages = originFilter === 'all'
    ? imageLibrary
    : imageLibrary.filter(a => a.origin === originFilter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60 flex-shrink-0">
        <span className="text-xs text-gray-500">{imageLibrary.length} ảnh</span>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Đang tải...
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
              Tải ảnh lên
            </>
          )}
        </button>
      </div>

      {/* AI image generation row */}
      <div className="px-4 py-2 border-b border-gray-700/60 flex-shrink-0">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleGenerateAI(); }}
          placeholder="Mô tả ảnh muốn tạo bằng AI..."
          disabled={generating}
          className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
        />
        <button
          onClick={handleGenerateAI}
          disabled={!aiPrompt.trim() || generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Đang tạo...
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
              Sinh ảnh AI
            </>
          )}
        </button>
      </div>
        {/* AI key requirement note — image generation backend uses an OpenAI key */}
        <p className="text-[11px] text-amber-500 mt-1.5">⚠ Cần trợ lý OpenAI đang bật (có API key) — cấu hình tại Tích hợp → Trợ lý AI.</p>
      </div>

      {/* Origin filter chips */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-700/60 flex-shrink-0">
        {([
          { key: 'all', label: 'Tất cả' },
          { key: 'ai', label: '🤖 AI' },
          { key: 'upload', label: '⬆ Upload' },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setOriginFilter(opt.key)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              originFilter === opt.key
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loadingImages ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Đang tải...</div>
        ) : imageLibrary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-gray-700">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <p className="text-gray-400 text-sm">Thư viện ảnh trống</p>
            <p className="text-gray-600 text-xs">Tải ảnh lên để dùng cho bài đăng</p>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-gray-400 text-sm">Không có ảnh phù hợp bộ lọc</p>
            <p className="text-gray-600 text-xs">Thử chọn "Tất cả" để xem mọi ảnh</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {filteredImages.map(asset => (
              <ImageTile key={asset.id} asset={asset} onDelete={handleDelete} onOpen={setLightboxSrc} />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox overlay — click anywhere to close */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out p-6"
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
