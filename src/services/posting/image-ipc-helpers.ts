// src/services/posting/image-ipc-helpers.ts
// Pure testable logic for image-folder IPC handlers (no Electron/I/O side effects).
// Handlers call these and handle file deletion from purgedRelPaths themselves.
import type DatabaseService from '../database/DatabaseService';
import type { ImageFolder, ImageAsset } from '../../models/automation';

export type Db = Pick<DatabaseService,
  'getImageFolders' | 'saveImageFolder' | 'deleteImageFolder' |
  'getImages' | 'moveImages' | 'deleteImages' | 'save'>;

type Ok<T> = { success: true } & T;
type Err = { success: false; error: string };

// ─── Folder helpers ──────────────────────────────────────────────────────────

export function folderListLogic(db: Db, a: { zaloId: string }):
  Ok<{ folders: ImageFolder[] }> | Err {
  if (!a.zaloId) return { success: false, error: 'Missing zaloId' };
  return { success: true, folders: db.getImageFolders(a.zaloId) };
}

export function folderSaveLogic(db: Db, a: { zaloId: string; folder: ImageFolder }):
  Ok<{ id: number }> | Err {
  if (!a.zaloId) return { success: false, error: 'Missing zaloId' };
  if (!a.folder?.name?.trim()) return { success: false, error: 'Tên thư mục không được trống' };
  const { id } = db.saveImageFolder({ ...a.folder, owner_zalo_id: a.zaloId });
  db.save();
  return { success: true, id };
}

export function folderDeleteLogic(db: Db, a: { zaloId: string; id: number; mode: 'move' | 'purge' }):
  Ok<{ purgedRelPaths: string[] }> | Err {
  if (!a.zaloId || !a.id) return { success: false, error: 'Missing zaloId or id' };
  if (a.mode !== 'move' && a.mode !== 'purge') return { success: false, error: 'mode phải là move|purge' };
  const { purgedRelPaths } = db.deleteImageFolder(a.zaloId, a.id, a.mode);
  db.save();
  return { success: true, purgedRelPaths };
}

// ─── Image helpers ───────────────────────────────────────────────────────────

export function imageListLogic(db: Db, a: { zaloId: string; folderId?: number | null | 'all' }):
  Ok<{ assets: ImageAsset[] }> | Err {
  if (!a.zaloId) return { success: false, error: 'Missing zaloId' };
  return { success: true, assets: db.getImages(a.zaloId, a.folderId) };
}

export function imageMoveLogic(db: Db, a: { zaloId: string; ids: number[]; folderId: number | null }):
  Ok<{}> | Err {
  if (!a.zaloId) return { success: false, error: 'Missing zaloId' };
  const ids = normalizeDeleteIds({ ids: a.ids });
  if (ids.length === 0) return { success: false, error: 'Chưa chọn ảnh nào' };
  db.moveImages(a.zaloId, ids, a.folderId ?? null);
  db.save();
  return { success: true };
}

/** Normalizes legacy {id} and new {ids} payloads into a deduped array of positive integers. */
export function normalizeDeleteIds(a: { id?: number; ids?: number[] }): number[] {
  const raw = a.ids ?? (a.id != null ? [a.id] : []);
  return [...new Set(raw.filter((n) => typeof n === 'number' && n > 0))];
}
