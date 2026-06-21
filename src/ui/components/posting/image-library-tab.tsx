import React, { useEffect, useCallback, useState } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { showConfirm } from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import { toLocalMediaUrl } from '@/lib/localMedia';
import ipc from '@/lib/ipc';
import type { ImageAsset } from '@/../../src/models/automation';

// ─── Thumbnail tile ───────────────────────────────────────────────────────────

function ImageTile({ asset, onDelete }: { asset: ImageAsset; onDelete: (a: ImageAsset) => void }) {
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
          className="w-full h-full object-cover"
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
      const res = await ipc.posting?.imageDelete({ zaloId, id: asset.id });
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
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {imageLibrary.map(asset => (
              <ImageTile key={asset.id} asset={asset} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
