/**
 * post-store-ipc.ts
 * IPC CRUD cho Kho bài (post_store) — dùng chung FB+Zalo. AI-tạo-nhiều làm ở renderer
 * (reuse generate-variations + build-posts) rồi gọi save nhiều lần.
 */
import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';

export function registerPostStoreIpc(): void {
  ipcMain.handle('poststore:list', async () => {
    try { return { success: true, posts: DatabaseService.getInstance().listPosts(), total: DatabaseService.getInstance().countPosts() }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('poststore:save', async (_e, { post }: { post: { id?: number; title: string; content: string; image_count: number; source?: string } }) => {
    try { return { success: true, id: DatabaseService.getInstance().savePost(post) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('poststore:delete', async (_e, { id }: { id: number }) => {
    try { DatabaseService.getInstance().deletePost(id); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('poststore:deleteMany', async (_e, { ids }: { ids: number[] }) => {
    try { DatabaseService.getInstance().deletePosts(ids || []); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('poststore:deleteAll', async () => {
    try { DatabaseService.getInstance().deleteAllPosts(); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });
}
