/**
 * chatAgentIpc.ts
 *
 * IPC handlers for the Chat Agent feature (auto-reply agent-centric module).
 * Mirrors postingIpc's {success, error, ...data} envelope and try/catch pattern.
 * DB CRUD lives in DatabaseService; routing logic in chat-agent-resolver.
 */

import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import {
    resolveChatAgent,
    ChatAgentRule,
    ThreadCtx,
} from '../../src/services/chat-agent/chat-agent-resolver';
import Logger from '../../src/utils/Logger';

/** Map a stored ChatAgent row (with thread_ids/label_ids) to the resolver's rule shape. */
function toRule(a: any): ChatAgentRule {
    return {
        id: a.id,
        enabled: !!a.enabled,
        threadIds: (a.thread_ids || []).map(String),
        labelIds: (a.label_ids || []).map(String),
        isDefault: !!a.is_default,
        defaultScope: { dm: !!a.default_scope_dm, group: !!a.default_scope_group },
        defaultStrangerOnly: !!a.default_stranger_only,
        replyMode: a.reply_mode || 'auto',
    };
}

export function registerChatAgentIpc(): void {

    // ─── Chat Agents (agent-centric) ────────────────────────────────────────────

    ipcMain.handle('chat-agent:list', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            const db = DatabaseService.getInstance();
            // thread_id → display name map (resolve once, like posting agentList)
            const gmap = new Map<string, string>();
            db.query<any>(`SELECT contact_id, display_name FROM contacts WHERE owner_zalo_id=?`, [zaloId])
                .forEach((r: any) => gmap.set(r.contact_id, r.display_name || r.contact_id));
            const agents = db.listChatAgents(zaloId).map(a => {
                const full = db.getChatAgent(a.id!)!;
                return { ...full, groupNames: (full.thread_ids || []).map(t => gmap.get(t) || t) };
            });
            return { success: true, agents };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('chat-agent:get', async (_e, { id }: { id: number }) => {
        try { return { success: true, agent: DatabaseService.getInstance().getChatAgent(id) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('chat-agent:save', async (_e, { zaloId, agent }: { zaloId: string; agent: any }) => {
        try {
            const db = DatabaseService.getInstance();
            const id = db.saveChatAgent({ ...agent, owner_zalo_id: zaloId });
            db.save();
            return { success: true, id };
        } catch (e: any) { Logger.error(`[chatAgentIpc] save: ${e.message}`); return { success: false, error: e.message }; }
    });

    ipcMain.handle('chat-agent:enable', async (_e, { id, enabled }: { id: number; enabled: boolean }) => {
        try {
            const db = DatabaseService.getInstance();
            db.setChatAgentEnabled(id, enabled ? 1 : 0);
            db.save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('chat-agent:delete', async (_e, { id }: { id: number }) => {
        try {
            const db = DatabaseService.getInstance();
            db.deleteChatAgent(id);
            db.save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Conversation AI State (per-thread pause/pin) ────────────────────────────

    ipcMain.handle('chat-agent:convState', async (_e, { zaloId, threadId, channel }: { zaloId: string; threadId: string; channel?: string }) => {
        try {
            return { success: true, state: DatabaseService.getInstance().getConversationAiState(zaloId, threadId, channel || 'zalo') };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Bật/tắt AI cho 1 hội thoại. paused=false = "Giao lại cho Agent".
    ipcMain.handle('chat-agent:setAiState', async (_e, { zaloId, threadId, paused, channel }: { zaloId: string; threadId: string; paused: boolean; channel?: string }) => {
        try {
            const db = DatabaseService.getInstance();
            db.setConversationAiState(zaloId, threadId, {
                paused: paused ? 1 : 0,
                paused_reason: paused ? 'manual' : '',
                paused_at: Date.now(),
            }, channel || 'zalo');
            db.save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Ghim hội thoại vào 1 agent (agentId null = bỏ ghim).
    ipcMain.handle('chat-agent:pin', async (_e, { zaloId, threadId, agentId, channel }: { zaloId: string; threadId: string; agentId?: number | null; channel?: string }) => {
        try {
            const db = DatabaseService.getInstance();
            db.setConversationAiState(zaloId, threadId, { pinned_agent_id: agentId ?? null }, channel || 'zalo');
            db.save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // Quyết định agent nào phụ trách 1 hội thoại (Bảng định tuyến + header).
    ipcMain.handle('chat-agent:resolveThread', async (_e, { zaloId, threadId, threadType, isFriend, channel }: { zaloId: string; threadId: string; threadType: 'user' | 'group'; isFriend?: boolean; channel?: string }) => {
        try {
            const db = DatabaseService.getInstance();
            const labelIds = db.getLocalLabelThreads(zaloId)
                .filter(r => r.thread_id === threadId)
                .map(r => String(r.label_id));
            const resolvedIsFriend = isFriend !== undefined
                ? isFriend
                : (threadType === 'user' ? db.checkIsFriend(zaloId, threadId) : false);
            const pinnedAgentId = db.getConversationAiState(zaloId, threadId, channel || 'zalo')?.pinned_agent_id ?? null;
            const ctx: ThreadCtx = { threadId, threadType, isFriend: resolvedIsFriend, labelIds, pinnedAgentId };
            const agents = db.listEnabledChatAgents(zaloId, channel || 'zalo').map(toRule);
            const agentId = resolveChatAgent(ctx, agents);
            return { success: true, agentId };
        } catch (e: any) { return { success: false, error: e.message }; }
    });
}
