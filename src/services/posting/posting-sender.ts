/**
 * posting-sender.ts
 *
 * Shared sending helpers for the agent posting module.
 * - resolveAgentImagePaths: decide which images to attach based on agent.image_mode
 * - sendDraftToGroup: send text + N images to one group, log result with agent_id
 */

import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import { ThreadType } from 'zca-js';
import DatabaseService from '../database/DatabaseService';
import FileStorageService from '../file/FileStorageService';
import Logger from '../../utils/Logger';
import type { PostingAgent, ContentDraft } from '../../models';

/**
 * Resolve absolute image paths for a draft under an agent's image policy.
 * - none  → []
 * - fixed → the agent's fixed_image_ids
 * - auto  → draft's linked image, else `image_count` random from library
 */
export function resolveAgentImagePaths(zaloId: string, agent: PostingAgent, draft: ContentDraft): string[] {
    try {
        const db = DatabaseService.getInstance();
        if (agent.image_mode === 'none') return [];
        const assets = db.getImageAssets(zaloId);
        if (!assets.length) return [];

        let chosen: typeof assets = [];

        if (agent.image_mode === 'fixed') {
            const ids = agent.fixed_image_ids || [];
            chosen = assets.filter(a => a.id != null && ids.includes(a.id));
        } else {
            // auto
            if (draft.image_asset_id) {
                const linked = assets.find(a => a.id === draft.image_asset_id);
                if (linked) chosen = [linked];
            }
            if (!chosen.length) {
                const want = Math.min(assets.length, Math.max(1, agent.image_count || 2));
                const pool = [...assets];
                while (chosen.length < want && pool.length) {
                    const i = Math.floor(Math.random() * pool.length);
                    chosen.push(pool.splice(i, 1)[0]);
                }
            }
        }

        return chosen
            .map(a => (a.rel_path ? FileStorageService.resolveAbsolutePath(a.rel_path) : null))
            .filter((p): p is string => !!p);
    } catch (e: any) {
        Logger.warn(`[posting-sender] ${zaloId}: image resolve error: ${e.message}`);
        return [];
    }
}

/**
 * Send text + 0..N images to one group. Returns true if delivered.
 * Each image is sent as its own message (robust). Logs to post_log with agent_id.
 */
export async function sendDraftToGroup(
    api: any,
    args: { zaloId: string; agentId: number | null; draftId: number; text: string; groupId: string; imagePaths: string[] },
): Promise<boolean> {
    const db = DatabaseService.getInstance();
    const { zaloId, agentId, draftId, text, groupId, imagePaths } = args;
    const hasText = !!text?.trim();
    if (!hasText && imagePaths.length === 0) {
        Logger.warn(`[posting-sender] ${zaloId} group ${groupId}: draft ${draftId} empty — skipped`);
        return false;
    }
    try {
        if (hasText) await api.sendMessage({ msg: text }, groupId, ThreadType.Group);

        let imagesSent = 0;
        for (let i = 0; i < imagePaths.length; i++) {
            const imgPath = imagePaths[i];
            try {
                const buffer = fs.readFileSync(imgPath);
                const baseName = path.basename(imgPath);
                const ext = path.extname(baseName) || '.jpg';
                const safeFilename = (path.extname(baseName) ? baseName : `${baseName}${ext}`) as `${string}.${string}`;
                let width = 0, height = 0;
                try { const dim = imageSize(buffer); width = dim.width ?? 0; height = dim.height ?? 0; } catch {}
                if (i > 0 || hasText) await new Promise(r => setTimeout(r, 1200));
                await api.sendMessage(
                    { msg: '', attachments: [{ data: buffer, filename: safeFilename, metadata: { totalSize: buffer.length, width, height } }] },
                    groupId, ThreadType.Group,
                );
                imagesSent++;
            } catch (imgErr: any) {
                Logger.warn(`[posting-sender] ${zaloId} group ${groupId}: image failed (${imgPath}): ${imgErr.message}`);
            }
        }

        if (!hasText && imagesSent === 0) {
            db.addPostLog({ owner_zalo_id: zaloId, agent_id: agentId, draft_id: draftId, group_id: groupId, status: 'failed', error: 'all images failed', posted_at: Date.now() });
            return false;
        }
        db.addPostLog({ owner_zalo_id: zaloId, agent_id: agentId, draft_id: draftId, group_id: groupId, status: 'sent', posted_at: Date.now() });
        Logger.log(`[posting-sender] ${zaloId} group ${groupId}: sent draft ${draftId} (text=${hasText}, images=${imagesSent})`);
        return true;
    } catch (err: any) {
        const errMsg = err?.message || String(err);
        Logger.error(`[posting-sender] ${zaloId} group ${groupId}: send failed: ${errMsg}`);
        db.addPostLog({ owner_zalo_id: zaloId, agent_id: agentId, draft_id: draftId, group_id: groupId, status: 'failed', error: errMsg, posted_at: Date.now() });
        return false;
    }
}
