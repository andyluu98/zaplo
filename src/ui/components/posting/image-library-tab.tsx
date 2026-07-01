import React, { useEffect, useCallback, useState } from 'react';
import { usePostingStore } from '@/store/posting-store';
import { showConfirm } from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import type { ImageAsset, ImageFolder } from '@/../../src/models/automation';
import FolderList, { type FolderKey } from './image-library/folder-list';
import ImageGrid from './image-library/image-grid';
import { AddFolderModal, DeleteFolderModal, MoveImagesModal } from './image-library/folder-modals';

export default function ImageLibraryTab({ zaloId }: { zaloId: string }) {
  const {
    imageLibrary, setImageLibrary, loadingImages, setLoadingImages,
    folders, setFolders, currentFolderId, setCurrentFolderId,
  } = usePostingStore();
  const { showNotification } = useAppStore();

  const [uploading, setUploading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [uncCount, setUncCount] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [delFolder, setDelFolder] = useState<ImageFolder | null>(null);
  const [showMove, setShowMove] = useState(false);

  // folderId passed to IPC: 'all' → undefined (fetch all), null → null (unclassified), number → that folder
  const listArg = currentFolderId === 'all' ? undefined : currentFolderId;
  // Uploads/AI into 'all' go to null (unclassified); specific folder → that folder id
  const uploadFolderId = currentFolderId === 'all' ? null : currentFolderId;

  const fetchFolders = useCallback(async () => {
    if (!zaloId) return;
    try {
      const res = await ipc.posting?.folderList({ zaloId });
      if (res?.success) setFolders(res.folders ?? []);
    } catch (e) {
      console.error('[ImageLibraryTab] folderList error', e);
    }
  }, [zaloId, setFolders]);

  const fetchUncCount = useCallback(async () => {
    if (!zaloId) return;
    try {
      const res = await ipc.posting?.imageList({ zaloId, folderId: null });
      if (res?.success) setUncCount(res.assets?.length ?? 0);
    } catch { /* noop */ }
  }, [zaloId]);

  const fetchImages = useCallback(async () => {
    if (!zaloId) return;
    setLoadingImages(true);
    try {
      const res = await ipc.posting?.imageList({ zaloId, folderId: listArg });
      if (res?.success) setImageLibrary(res.assets ?? []);
    } catch (e) {
      console.error('[ImageLibraryTab] imageList error', e);
    } finally {
      setLoadingImages(false);
    }
  }, [zaloId, listArg, setImageLibrary, setLoadingImages]);

  useEffect(() => { fetchFolders(); fetchUncCount(); }, [fetchFolders, fetchUncCount]);
  useEffect(() => { fetchImages(); }, [fetchImages]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchFolders(), fetchImages(), fetchUncCount()]);
  }, [fetchFolders, fetchImages, fetchUncCount]);

  const allCount = folders.reduce((s, f) => s + (f.image_count ?? 0), 0) + uncCount;

  const folderLabel =
    currentFolderId === 'all' ? 'Tất cả'
    : currentFolderId === null ? 'Chưa phân loại'
    : folders.find((f) => f.id === currentFolderId)?.name ?? '';

  // ── selection ──
  const clearSel = () => { setSelectedIds(new Set()); };
  const tileClick = (a: ImageAsset) => {
    if (a.id == null) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(a.id!) ? next.delete(a.id!) : next.add(a.id!);
      return next;
    });
  };
  const selectFolder = (id: FolderKey) => { setCurrentFolderId(id); clearSel(); };

  // ── upload ──
  const handleUpload = async () => {
    if (!zaloId || uploading) return;
    const result = await ipc.file?.openDialog({
      multiSelect: true,
      filters: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (!result?.success || result.canceled || !result.filePaths?.length) return;
    setUploading(true);
    try {
      const results = await Promise.allSettled(
        result.filePaths.map((filePath: string) =>
          ipc.posting?.imageUpload({ zaloId, filePath, folderId: uploadFolderId })
        )
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
      const ok = results.length - failed;
      if (ok > 0) showNotification(`Đã tải lên ${ok} ảnh vào "${folderLabel}"`, 'success');
      if (failed > 0) showNotification(`${failed} ảnh thất bại`, 'error');
      await refreshAll();
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi tải ảnh', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── generate AI ──
  const handleGenerateAI = async () => {
    if (!zaloId || !aiPrompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await ipc.posting?.imageGenerate({ zaloId, prompt: aiPrompt.trim(), folderId: uploadFolderId });
      if (res?.success) {
        showNotification('Đã tạo ảnh AI', 'success');
        setAiPrompt('');
        await refreshAll();
      } else {
        showNotification(res?.error || 'Tạo ảnh thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── single delete ──
  const handleDeleteOne = useCallback(async (id: number) => {
    const ok = await showConfirm({
      title: 'Xóa ảnh này?',
      message: 'Thao tác không thể hoàn tác.',
      variant: 'danger', confirmText: 'Xóa',
    });
    if (!ok) return;
    try {
      const res = await ipc.posting?.imageDelete({ zaloId, ids: [id] });
      if (res?.success) {
        showNotification('Đã xóa ảnh', 'success');
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        await refreshAll();
      } else {
        showNotification(res?.error || 'Xóa thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  }, [zaloId, refreshAll, showNotification]);

  // ── bulk delete ──
  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const ok = await showConfirm({
      title: `Xóa ${ids.length} ảnh?`,
      message: 'Thao tác không thể hoàn tác.',
      variant: 'danger', confirmText: 'Xóa',
    });
    if (!ok) return;
    try {
      const res = await ipc.posting?.imageDelete({ zaloId, ids });
      if (res?.success) {
        showNotification(`Đã xóa ${ids.length} ảnh`, 'success');
        clearSel();
        await refreshAll();
      } else {
        showNotification(res?.error || 'Xóa thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  // ── move (bulk or single via context menu) ──
  const handleMove = async (folderId: number | null) => {
    const ids = [...selectedIds];
    setShowMove(false);
    if (!ids.length) return;
    try {
      const res = await ipc.posting?.imageMove({ zaloId, ids, folderId });
      if (res?.success) {
        showNotification(`Đã di chuyển ${ids.length} ảnh`, 'success');
        clearSel();
        await refreshAll();
      } else {
        showNotification(res?.error || 'Di chuyển thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  // Context menu "Di chuyển tới…" for a single image:
  // select just that image then open MoveImagesModal.
  const handleMoveOne = useCallback((id: number) => {
    setSelectedIds(new Set([id]));
    setShowMove(true);
  }, []);

  // ── folder CRUD ──
  const handleAddFolder = async (name: string, description: string) => {
    setShowAdd(false);
    try {
      const res = await ipc.posting?.folderSave({ zaloId, folder: { owner_zalo_id: zaloId, name, description } });
      if (res?.success) {
        showNotification('Đã tạo thư mục', 'success');
        await fetchFolders();
        if (res.id) setCurrentFolderId(res.id);
      } else {
        showNotification(res?.error || 'Tạo thư mục thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  const handleRenameFolder = async (folder: ImageFolder) => {
    const name = window.prompt('Đổi tên thư mục:', folder.name);
    if (!name || !name.trim() || name.trim() === folder.name) return;
    try {
      const res = await ipc.posting?.folderSave({ zaloId, folder: { ...folder, name: name.trim() } });
      if (res?.success) { showNotification('Đã đổi tên', 'success'); await fetchFolders(); }
      else showNotification(res?.error || 'Đổi tên thất bại', 'error');
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  const handleDeleteFolder = async (mode: 'move' | 'purge') => {
    const f = delFolder;
    setDelFolder(null);
    if (!f?.id) return;
    try {
      const res = await ipc.posting?.folderDelete({ zaloId, id: f.id, mode });
      if (res?.success) {
        showNotification('Đã xóa thư mục', 'success');
        if (currentFolderId === f.id) setCurrentFolderId('all');
        await refreshAll();
      } else {
        showNotification(res?.error || 'Xóa thư mục thất bại', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Lỗi kết nối', 'error');
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <FolderList
        folders={folders}
        currentFolderId={currentFolderId}
        allCount={allCount}
        uncategorizedCount={uncCount}
        onSelect={selectFolder}
        onAdd={() => setShowAdd(true)}
        onRename={handleRenameFolder}
        onDelete={(f) => setDelFolder(f)}
      />
      <ImageGrid
        assets={imageLibrary}
        loading={loadingImages}
        folderLabel={folderLabel}
        uploading={uploading}
        generating={generating}
        selectedIds={selectedIds}
        aiPrompt={aiPrompt}
        onAiPromptChange={setAiPrompt}
        onUpload={handleUpload}
        onGenerateAI={handleGenerateAI}
        onTileClick={tileClick}
        onDeleteOne={handleDeleteOne}
        onBulkMove={() => setShowMove(true)}
        onBulkDelete={handleBulkDelete}
        onClearSel={clearSel}
        onMoveOne={handleMoveOne}
      />

      <AddFolderModal open={showAdd} onClose={() => setShowAdd(false)} onSubmit={handleAddFolder} />
      <DeleteFolderModal open={!!delFolder} folder={delFolder} onClose={() => setDelFolder(null)} onSubmit={handleDeleteFolder} />
      <MoveImagesModal open={showMove} count={selectedIds.size} folders={folders} onClose={() => setShowMove(false)} onSubmit={handleMove} />
    </div>
  );
}
