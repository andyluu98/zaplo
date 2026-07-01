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
import AgentSchedulerService from '../../src/services/posting/agent-scheduler-service';
import ContentDraftGenerator from '../../src/services/posting/content-draft-generator';
import AIAssistantService from '../../src/services/ai/AIAssistantService';
import { generateImage } from '../../src/services/posting/posting-image-generator';
import { postManualToGroups } from '../../src/services/posting/manual-post-sender';
import Logger from '../../src/utils/Logger';
import { folderListLogic, folderSaveLogic, folderDeleteLogic,
         imageListLogic, imageMoveLogic, normalizeDeleteIds } from '../../src/services/posting/image-ipc-helpers';
import type { ImageFolder } from '../../src/models/automation';

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

    ipcMain.handle('posting:draft.generate', async (_e, { zaloId, pillarId, count, agentId }: { zaloId: string; pillarId: number; count: number; agentId?: number }) => {
        try {
            const ids = await ContentDraftGenerator.getInstance().generateDrafts(zaloId, pillarId, count ?? 1, { agentId: agentId ?? null });
            DatabaseService.getInstance().save();
            return { success: true, ids };
        } catch (e: any) {
            Logger.error(`[postingIpc] draft.generate: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('posting:draft.list', async (_e, { zaloId, status, agentId }: { zaloId: string; status?: string; agentId?: number }) => {
        try {
            const drafts = DatabaseService.getInstance().getContentDrafts(zaloId, status as any, agentId);
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

    ipcMain.handle('posting:draft.delete', async (_e, { zaloId, id }: { zaloId: string; id: number }) => {
        try {
            DatabaseService.getInstance().deleteContentDraft(zaloId, id);
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
            const db = DatabaseService.getInstance();
            // Preserve the enabled flag from DB — the "Lưu cài đặt" button must NOT flip
            // on/off (that is the toggle's job). This prevents stale UI state from
            // silently disabling the bot. First save (no existing row) uses payload value.
            const existing = db.getPostSchedule(zaloId);
            const effectiveEnabled = existing ? existing.enabled : (schedule.enabled ?? 0);
            const id = db.savePostSchedule({ ...schedule, owner_zalo_id: zaloId, enabled: effectiveEnabled });
            db.save();
            // Reconcile the in-memory scheduler with the persisted enabled flag so the
            // running timer always matches DB state (self-healing after restarts/saves).
            const scheduler = PostingSchedulerService.getInstance();
            if (effectiveEnabled) scheduler.startForAccount(zaloId);
            else scheduler.stopForAccount(zaloId);
            // Reset cached daily plan so next tick rebuilds with the new window/posts_per_day
            scheduler.resetPlan(zaloId);
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
                // Reset plan so the scheduler picks up the saved window immediately
                scheduler.resetPlan(zaloId);
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

    ipcMain.handle('posting:log.list', async (_e, { zaloId, limit, agentId }: { zaloId: string; limit?: number; agentId?: number }) => {
        try {
            return { success: true, logs: DatabaseService.getInstance().getPostLog(zaloId, limit ?? 100, agentId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Posting Agents (agent-centric module) ──────────────────────────────────

    ipcMain.handle('posting:agent.list', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            const db = DatabaseService.getInstance();
            const sched = AgentSchedulerService.getInstance();
            // group_id → display name map (resolve once)
            const gmap = new Map<string, string>();
            db.query<any>(`SELECT contact_id, display_name FROM contacts WHERE owner_zalo_id=? AND contact_type='group'`, [zaloId])
                .forEach((r: any) => gmap.set(r.contact_id, r.display_name || r.contact_id));
            const agents = db.listPostingAgents(zaloId).map(a => {
                const full = db.getPostingAgent(a.id!)!;
                return { ...full, status: sched.getStatus(a.id!), groupNames: (full.group_ids || []).map(g => gmap.get(g) || g) };
            });
            return { success: true, agents };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.get', async (_e, { id }: { id: number }) => {
        try { return { success: true, agent: DatabaseService.getInstance().getPostingAgent(id) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.save', async (_e, { zaloId, agent }: { zaloId: string; agent: any }) => {
        try {
            const db = DatabaseService.getInstance();
            const id = db.savePostingAgent({ ...agent, owner_zalo_id: zaloId });
            if (Array.isArray(agent.schedules)) db.replaceAgentSchedules(id, agent.schedules);
            db.save();
            const sched = AgentSchedulerService.getInstance();
            if (agent.enabled) sched.startForAgent(id); else sched.stopForAgent(id);
            sched.resetPlan(id);
            return { success: true, id };
        } catch (e: any) { Logger.error(`[postingIpc] agent.save: ${e.message}`); return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.enable', async (_e, { id, enabled }: { id: number; enabled: boolean }) => {
        try {
            const db = DatabaseService.getInstance();
            db.setAgentEnabled(id, enabled ? 1 : 0); db.save();
            const sched = AgentSchedulerService.getInstance();
            if (enabled) { sched.startForAgent(id); sched.resetPlan(id); } else sched.stopForAgent(id);
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.delete', async (_e, { id }: { id: number }) => {
        try {
            AgentSchedulerService.getInstance().stopForAgent(id);
            DatabaseService.getInstance().deletePostingAgent(id);
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.status', async (_e, { id }: { id: number }) => {
        try { return { success: true, status: AgentSchedulerService.getInstance().getStatus(id) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:agent.postNow', async (_e, { agentId, draftId }: { agentId: number; draftId?: number }) => {
        try { const r = await AgentSchedulerService.getInstance().postNow(agentId, draftId); return { success: true, ...r }; }
        catch (e: any) { Logger.error(`[postingIpc] agent.postNow: ${e.message}`); return { success: false, ok: false, error: e.message }; }
    });

    // Calendar one-off entries (kind='once') across the account's agents for a month
    ipcMain.handle('posting:calendar.list', async (_e, { zaloId, ym }: { zaloId: string; ym: string }) => {
        try {
            const db = DatabaseService.getInstance();
            const rows = db.query<any>(
                `SELECT s.*, a.name AS agent_name FROM agent_schedule s JOIN posting_agent a ON a.id=s.agent_id
                 WHERE a.owner_zalo_id=? AND s.kind='once' AND s.date LIKE ? ORDER BY s.date, s.time`,
                [zaloId, `${ym}%`],
            );
            return { success: true, entries: rows };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Add a one-off (kind='once') calendar entry for an agent on a specific date+time
    ipcMain.handle('posting:calendar.add', async (_e, { agentId, date, time }: { agentId: number; date: string; time: string }) => {
        try {
            if (!agentId || !date || !time) return { success: false, error: 'Thiếu agent, ngày hoặc giờ' };
            const id = DatabaseService.getInstance().saveAgentSchedule({
                agent_id: agentId, kind: 'once', date, time,
                window_start: time, window_end: time, posts_per_day: 1, enabled: 1,
            } as any);
            DatabaseService.getInstance().save();
            AgentSchedulerService.getInstance().resetPlan(agentId); // pick up the new slot today
            return { success: true, id };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Delete a one-off calendar entry (or any agent_schedule rule) by id
    ipcMain.handle('posting:calendar.delete', async (_e, { id, agentId }: { id: number; agentId?: number }) => {
        try {
            DatabaseService.getInstance().deleteAgentSchedule(id);
            DatabaseService.getInstance().save();
            if (agentId) AgentSchedulerService.getInstance().resetPlan(agentId);
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Post history for a month (calendar) — joined with agent + group names + draft preview
    ipcMain.handle('posting:log.month', async (_e, { zaloId, ym }: { zaloId: string; ym: string }) => {
        try {
            const db = DatabaseService.getInstance();
            const start = new Date(`${ym}-01T00:00:00`).getTime();
            const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 1).getTime();
            const rows = db.query<any>(
                `SELECT l.posted_at, l.status, l.group_id, l.agent_id, l.draft_id,
                        a.name AS agent_name, c.display_name AS group_name, substr(d.text,1,60) AS draft_text
                 FROM post_log l
                 LEFT JOIN posting_agent a ON a.id=l.agent_id
                 LEFT JOIN contacts c ON c.contact_id=l.group_id AND c.owner_zalo_id=l.owner_zalo_id
                 LEFT JOIN content_draft d ON d.id=l.draft_id
                 WHERE l.owner_zalo_id=? AND l.posted_at>=? AND l.posted_at<? ORDER BY l.posted_at DESC`,
                [zaloId, start, end],
            );
            return { success: true, logs: rows };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('posting:stats', async (_e, { zaloId, agentId, sinceMs }: { zaloId: string; agentId?: number; sinceMs?: number }) => {
        try {
            const db = DatabaseService.getInstance();
            const stats = db.getAgentStats(zaloId, agentId, sinceMs);
            const names = Object.fromEntries(db.listPostingAgents(zaloId).map(a => [a.id, a.name]));
            return { success: true, stats: stats.map(s => ({ ...s, name: names[s.agent_id] || `#${s.agent_id}` })) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Bot status ───────────────────────────────────────────────────────────

    ipcMain.handle('posting:bot.status', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            return { success: true, status: PostingSchedulerService.getInstance().getStatus(zaloId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Post the oldest approved draft to all selected groups RIGHT NOW (test button),
    // bypassing the schedule window. Returns counts + per-group results.
    ipcMain.handle('posting:test.postNow', async (_e, { zaloId, draftId }: { zaloId: string; draftId?: number }) => {
        try {
            const r = await PostingSchedulerService.getInstance().postNow(zaloId, draftId);
            return { success: true, ...r };
        } catch (e: any) {
            Logger.error(`[postingIpc] test.postNow: ${e.message}`);
            return { success: false, ok: false, error: e.message };
        }
    });

    // Đăng TAY (Soạn & Đăng): đăng 1 nội dung + ảnh tới nhiều nhóm Zalo ngay.
    ipcMain.handle('posting:manualPost', async (_e, { zaloId, text, groupIds, imageAssetIds }: { zaloId: string; text: string; groupIds: string[]; imageAssetIds?: number[] }) => {
        try {
            const r = await postManualToGroups({ zaloId, text, groupIds, imageAssetIds });
            return { success: r.ok, ...r };
        } catch (e: any) {
            Logger.error(`[postingIpc] manualPost: ${e.message}`);
            return { success: false, ok: false, error: e.message };
        }
    });

    // ─── Image Folders ─────────────────────────────────────────────────────────

    /** posting:folder.list -> { success, folders } */
    ipcMain.handle('posting:folder.list', async (_e, a: { zaloId: string }) => {
        try { return folderListLogic(DatabaseService.getInstance(), a); }
        catch (e: any) { Logger.error(`[postingIpc] folder.list: ${e.message}`); return { success: false, error: e.message }; }
    });

    /** posting:folder.save -> { success, id } */
    ipcMain.handle('posting:folder.save', async (_e, a: { zaloId: string; folder: ImageFolder }) => {
        try { return folderSaveLogic(DatabaseService.getInstance(), a); }
        catch (e: any) { Logger.error(`[postingIpc] folder.save: ${e.message}`); return { success: false, error: e.message }; }
    });

    /** posting:folder.delete -> { success } (mode: 'move'|'purge'). Purge deletes files from disk. */
    ipcMain.handle('posting:folder.delete', async (_e, a: { zaloId: string; id: number; mode: 'move' | 'purge' }) => {
        try {
            const result = folderDeleteLogic(DatabaseService.getInstance(), a);
            if (result.success && a.mode === 'purge') {
                for (const relPath of result.purgedRelPaths) {
                    const absPath = FileStorageService.resolveAbsolutePath(relPath);
                    FileStorageService.deleteFile(absPath);
                }
            }
            return result.success ? { success: true } : result;
        } catch (e: any) { Logger.error(`[postingIpc] folder.delete: ${e.message}`); return { success: false, error: e.message }; }
    });

    // ─── Image Library ────────────────────────────────────────────────────────

    /**
     * posting:image.upload — copy a user-picked file into managed media storage
     * and register it in image_asset. Accepts optional folderId to assign the
     * image to a folder immediately on upload.
     * Args: { zaloId: string; filePath: string; folderId?: number | null }
     * Returns: { success: true; id: number; rel_path: string } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.upload', async (_e, { zaloId, filePath, folderId }: { zaloId: string; filePath: string; folderId?: number | null }) => {
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
            const id = db.saveImageAsset({ owner_zalo_id: zaloId, rel_path, origin: 'upload', width, height, folder_id: folderId ?? null });
            db.save();

            return { success: true, id, rel_path };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.upload: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    /**
     * posting:image.list — return image_asset rows for a zaloId.
     * Accepts optional folderId: number = specific folder, null = unassigned, 'all' = all images.
     * Renderer calls toLocalMediaUrl(rel_path) to display images.
     * Args: { zaloId: string; folderId?: number | null | 'all' }
     * Returns: { success: true; assets: ImageAsset[] } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.list', async (_e, a: { zaloId: string; folderId?: number | null | 'all' }) => {
        try { return imageListLogic(DatabaseService.getInstance(), a); }
        catch (e: any) { Logger.error(`[postingIpc] image.list: ${e.message}`); return { success: false, error: e.message }; }
    });

    /**
     * posting:image.move — move images to a different folder (or null = unassigned).
     * Args: { zaloId: string; ids: number[]; folderId: number | null }
     * Returns: { success: true } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.move', async (_e, a: { zaloId: string; ids: number[]; folderId: number | null }) => {
        try { return imageMoveLogic(DatabaseService.getInstance(), a); }
        catch (e: any) { Logger.error(`[postingIpc] image.move: ${e.message}`); return { success: false, error: e.message }; }
    });

    /**
     * posting:image.generate — generate an AI image via DALL-E 3, save to media storage,
     * and register it as an image_asset with origin='ai'. Accepts optional folderId to
     * assign the generated image to a folder immediately.
     * Args: { zaloId: string; prompt: string; folderId?: number | null }
     * Returns: { success: true; id: number; rel_path: string } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.generate', async (_e, { zaloId, prompt, folderId }: { zaloId: string; prompt: string; folderId?: number | null }) => {
        try {
            if (!zaloId || !prompt?.trim()) return { success: false, error: 'Missing zaloId or prompt' };

            // Resolve the first enabled OpenAI assistant's decrypted API key
            const assistants = AIAssistantService.getInstance().listAssistants();
            const openaiAssistant = assistants.find(a => a.platform === 'openai' && a.enabled && a.apiKey);
            if (!openaiAssistant) {
                return { success: false, error: 'Chưa cấu hình trợ lý OpenAI (cần API key OpenAI trong Cài đặt AI)' };
            }

            const apiKey = openaiAssistant.apiKey;
            // Mask key in logs: show first 8 + last 4 chars
            const keyPreview = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
            Logger.info(`[postingIpc] image.generate: zaloId=${zaloId}, promptLen=${prompt.length}, keyPreview=${keyPreview}`);

            // Call DALL-E 3 — returns a temporary image URL
            const imageUrl = await generateImage(prompt.trim(), apiKey);

            // Download and save to managed media storage
            const fname = `ai_${Date.now()}.jpg`;
            const rel_path = await FileStorageService.downloadImage(zaloId, imageUrl, fname);
            if (!rel_path) return { success: false, error: 'Không thể tải ảnh từ OpenAI về máy' };

            // Compute dimensions (best-effort — non-fatal if image-size fails)
            let width: number | null = null;
            let height: number | null = null;
            try {
                const absPath = FileStorageService.resolveAbsolutePath(rel_path);
                const buf = fs.readFileSync(absPath);
                const dim = imageSize(buf);
                width = dim.width ?? null;
                height = dim.height ?? null;
            } catch { /* non-fatal */ }

            const db = DatabaseService.getInstance();
            const id = db.saveImageAsset({ owner_zalo_id: zaloId, rel_path, origin: 'ai', width, height, folder_id: folderId ?? null });
            db.save();

            Logger.info(`[postingIpc] image.generate: saved id=${id}, rel_path=${rel_path}`);
            return { success: true, id, rel_path };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.generate: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    /**
     * posting:image.delete — delete image_asset rows and best-effort delete files from disk.
     * Accepts { ids: number[] } (new bulk) or legacy { id: number } — both normalized via normalizeDeleteIds.
     * Args: { zaloId: string; ids?: number[]; id?: number }
     * Returns: { success: true } | { success: false; error: string }
     */
    ipcMain.handle('posting:image.delete', async (_e, a: { zaloId: string; ids?: number[]; id?: number }) => {
        try {
            if (!a.zaloId) return { success: false, error: 'Missing zaloId' };
            const ids = normalizeDeleteIds(a);
            if (ids.length === 0) return { success: false, error: 'Chưa chọn ảnh nào' };
            const db = DatabaseService.getInstance();

            // Fetch rel_paths before deleting rows (deleteImages returns purgedRelPaths)
            const result = db.deleteImages(a.zaloId, ids);
            // db.deleteImages already calls save() internally

            // Best-effort file deletion — do not fail if file is missing
            for (const relPath of result.purgedRelPaths) {
                const absPath = FileStorageService.resolveAbsolutePath(relPath);
                FileStorageService.deleteFile(absPath);
            }

            return { success: true };
        } catch (e: any) {
            Logger.error(`[postingIpc] image.delete: ${e.message}`);
            return { success: false, error: e.message };
        }
    });
}
