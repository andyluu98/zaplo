/**
 * postingIpc.ts
 *
 * IPC handlers for Feature B — Group Posting Bot.
 * Mirrors the {success, error, ...data} envelope and try/catch pattern from crmIpc.
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import DatabaseService from '../../src/services/database/DatabaseService';
import FileStorageService from '../../src/services/file/FileStorageService';
import PostingSchedulerService from '../../src/services/posting/posting-scheduler-service';
import ContentDraftGenerator from '../../src/services/posting/content-draft-generator';
import Logger from '../../src/utils/Logger';

export function registerPostingIpc(): void {

    // ─── Content Pillars ──────────────────────────────────────────────────────

    ipcMain.handle('posting:pillar.list', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            return { success: true, pillars: DatabaseService.getInstance().getContentPillars(zaloId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:pillar.save', async (_e, { zaloId, pillar }: { zaloId: string; pillar: any }) => {
        try {
            const id = DatabaseService.getInstance().saveContentPillar({ ...pillar, owner_zalo_id: zaloId });
            DatabaseService.getInstance().save();
            return { success: true, id };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:pillar.delete', async (_e, { zaloId, id }: { zaloId: string; id: number }) => {
        try {
            DatabaseService.getInstance().deleteContentPillar(zaloId, id);
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Content Drafts ───────────────────────────────────────────────────────

    ipcMain.handle('posting:draft.generate', async (_e, { zaloId, pillarId, count }: { zaloId: string; pillarId: number; count: number }) => {
        try {
            const ids = await ContentDraftGenerator.getInstance().generateDrafts(zaloId, pillarId, count ?? 1);
            DatabaseService.getInstance().save();
            return { success: true, ids };
        } catch (e: any) {
            Logger.error(`[postingIpc] draft.generate: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('posting:draft.list', async (_e, { zaloId, status }: { zaloId: string; status?: string }) => {
        try {
            const drafts = DatabaseService.getInstance().getContentDrafts(zaloId, status as any);
            return { success: true, drafts };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:draft.approve', async (_e, { zaloId, id }: { zaloId: string; id: number }) => {
        try {
            DatabaseService.getInstance().updateDraftStatus(zaloId, id, 'approved');
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:draft.reject', async (_e, { zaloId, id }: { zaloId: string; id: number }) => {
        try {
            DatabaseService.getInstance().updateDraftStatus(zaloId, id, 'rejected');
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:draft.update', async (_e, { zaloId, id, text, imageAssetId }: { zaloId: string; id: number; text: string; imageAssetId?: number | null }) => {
        try {
            DatabaseService.getInstance().updateDraftContent(zaloId, id, text, imageAssetId ?? null);
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Post Schedule ────────────────────────────────────────────────────────

    ipcMain.handle('posting:schedule.get', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            return { success: true, schedule: DatabaseService.getInstance().getPostSchedule(zaloId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:schedule.save', async (_e, { zaloId, schedule }: { zaloId: string; schedule: any }) => {
        try {
            const id = DatabaseService.getInstance().savePostSchedule({ ...schedule, owner_zalo_id: zaloId });
            DatabaseService.getInstance().save();
            return { success: true, id };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:schedule.enable', async (_e, { zaloId, enabled }: { zaloId: string; enabled: boolean }) => {
        try {
            const db = DatabaseService.getInstance();
            const schedule = db.getPostSchedule(zaloId);
            if (!schedule) return { success: false, error: 'Chưa có lịch đăng bài' };
            db.savePostSchedule({ ...schedule, enabled: enabled ? 1 : 0 });
            db.save();
            const scheduler = PostingSchedulerService.getInstance();
            if (enabled) {
                scheduler.startForAccount(zaloId);
            } else {
                scheduler.stopForAccount(zaloId);
            }
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Zalo Groups list ─────────────────────────────────────────────────────
    // FIX C1: read already-synced group contacts from DB (names cached by zaloGroupUtils sync).
    // zca-js getAllGroups() returns { gridVerMap: { [groupId]: versionString } } — values are
    // plain version strings, not group objects — so we cannot extract names from the API directly.
    // The existing sync flow (zaloGroupUtils.ts) fetches full group info and stores it in the
    // `contacts` table with contact_type='group'. We read from there to get names + avatars.

    ipcMain.handle('posting:groups.list', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            const rows = DatabaseService.getInstance().query<{
                contact_id: string;
                display_name: string | null;
                avatar_url: string | null;
            }>(
                `SELECT contact_id, display_name, avatar_url
                 FROM contacts
                 WHERE owner_zalo_id = ? AND contact_type = 'group'
                 ORDER BY last_message_time DESC`,
                [zaloId],
            );
            const groups = rows.map(r => ({
                groupId: r.contact_id,
                name:    r.display_name || r.contact_id,
                avatar:  r.avatar_url   || '',
            }));
            return { success: true, groups };
        } catch (e: any) {
            Logger.error(`[postingIpc] groups.list: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    // ─── Post Log ─────────────────────────────────────────────────────────────

    ipcMain.handle('posting:log.list', async (_e, { zaloId, limit }: { zaloId: string; limit?: number }) => {
        try {
            return { success: true, logs: DatabaseService.getInstance().getPostLog(zaloId, limit ?? 100) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Bot status ───────────────────────────────────────────────────────────

    ipcMain.handle('posting:bot.status', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            return { success: true, status: PostingSchedulerService.getInstance().getStatus(zaloId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Image Library ────────────────────────────────────────────────────────

    /**
     * posting:image.upload — copy a user-picked file into managed media storage
     * and register it in image_asset.
     * Args: { zaloId: string; filePath: string }
     * Returns: { success: true; id: number; rel_path: string } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.upload', async (_e, { zaloId, filePath }: { zaloId: string; filePath: string }) => {
        try {
            if (!zaloId || !filePath) return { success: false, error: 'Missing zaloId or filePath' };
            if (!fs.existsSync(filePath)) return { success: false, error: 'Source file not found' };

            // getAccountDir creates the directory if it doesn't exist
            const destDir = FileStorageService.getAccountDir(zaloId);
            const ext = path.extname(filePath) || '.jpg';
            const fname = `upload_${Date.now()}${ext}`;
            const destPath = path.join(destDir, fname);

            fs.copyFileSync(filePath, destPath);

            // rel_path: "media/{zaloId}/{YYYY-MM-DD}/fname" — folder-agnostic
            const rel_path = FileStorageService.toRelativePath(destPath);

            // Best-effort width/height via image-size
            let width: number | null = null;
            let height: number | null = null;
            try {
                const buf = fs.readFileSync(destPath);
                const dim = imageSize(buf);
                width = dim.width ?? null;
                height = dim.height ?? null;
            } catch { /* non-fatal — dimensions are optional */ }

            const db = DatabaseService.getInstance();
            const id = db.saveImageAsset({ owner_zalo_id: zaloId, rel_path, origin: 'upload', width, height });
            db.save();

            return { success: true, id, rel_path };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.upload: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    /**
     * posting:image.list — return image_asset rows for a zaloId.
     * Renderer calls toLocalMediaUrl(rel_path) to display images.
     * Args: { zaloId: string }
     * Returns: { success: true; assets: ImageAsset[] } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.list', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            if (!zaloId) return { success: false, error: 'Missing zaloId' };
            const assets = DatabaseService.getInstance().getImageAssets(zaloId);
            return { success: true, assets };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.list: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    /**
     * posting:image.delete — delete image_asset row and best-effort delete the file.
     * Args: { zaloId: string; id: number }
     * Returns: { success: true } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.delete', async (_e, { zaloId, id }: { zaloId: string; id: number }) => {
        try {
            if (!zaloId || !id) return { success: false, error: 'Missing zaloId or id' };
            const db = DatabaseService.getInstance();

            // Fetch the asset to find the file path before deleting the row
            const assets = db.getImageAssets(zaloId);
            const asset = assets.find(a => a.id === id);

            db.deleteImageAsset(zaloId, id);
            db.save();

            // Best-effort file deletion — do not fail if file is missing
            if (asset?.rel_path) {
                const absPath = FileStorageService.resolveAbsolutePath(asset.rel_path);
                FileStorageService.deleteFile(absPath);
            }

            return { success: true };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.delete: ${e.message}`);
            return { success: false, error: e.message };
        }
    });
}
