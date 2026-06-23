/**
 * ChatAgentDispatcher — MAIN-process service that auto-replies to incoming
 * customer messages using a Chat Agent (assistant + routing rules).
 *
 * Flow per incoming message on thread T (account A):
 *   1. Skip own/AI echoes (isSelf) — but use them to auto-pause on human reply.
 *   2. Build ThreadCtx (type, friend, labels, pin) + load enabled agents (rules).
 *   3. decideChatReply() → skip | suggest | reply.
 *   4. reply → load history → chatForWorkflow() → parse segments → send each.
 *
 * Integrates into the LIVE message stream via EventBroadcaster.onBeforeSend
 * ('event:message') — the same hook WorkflowEngineService uses, so it runs in
 * the main process right when a message arrives.
 *
 * NOTE: This does NOT touch the legacy auto-reply workflow; both can coexist
 * until the migration phase removes the old path.
 */

import { ThreadType } from 'zca-js';
import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import EventBroadcaster from '../event/EventBroadcaster';
import AIAssistantService from '../ai/AIAssistantService';
import { parseStructuredResponse } from '../../utils/aiUtils';
import { decideChatReply, shouldAutoResume, groupTriggerMatched, stripSelfMentions } from './chat-agent-decider';
import type { ChatAgentRule, ThreadCtx } from './chat-agent-resolver';
import Logger from '../../utils/Logger';
import type { ChatAgent } from '../../models';

/** Window (ms) for treating a SELF message as an echo of something the AI just sent. */
const AI_SENT_TTL_MS = 60_000;
/** Min delay between two AI replies on the SAME thread (anti-loop / anti-spam). */
const MIN_REPLY_DELAY_MS = 8_000;
/** Default number of past messages fed to the assistant when the assistant has none configured. */
const DEFAULT_CONTEXT_COUNT = 30;

class ChatAgentDispatcher {
    private static instance: ChatAgentDispatcher;

    private started = false;
    private unsubscribe: (() => void) | null = null;

    /** `${threadId}|${normContent}` → expiry ts. Marks text the AI just sent, so its echo is ignored. */
    private aiSentKeys = new Map<string, number>();
    /** threadId → last AI reply ts (min-delay throttle, keyed within account via composite key). */
    private lastReplyAt = new Map<string, number>();
    /** Threads currently being processed — prevents concurrent double-replies. */
    private processing = new Set<string>();

    public static getInstance(): ChatAgentDispatcher {
        if (!ChatAgentDispatcher.instance) ChatAgentDispatcher.instance = new ChatAgentDispatcher();
        return ChatAgentDispatcher.instance;
    }

    /** Bind the 'event:message' listener (idempotent on unsubscribe handle). */
    private bind(): void {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = EventBroadcaster.onBeforeSend('event:message', (data: any) => {
            // Never let a handler error bubble into the broadcaster.
            Promise.resolve(this.onMessage(data)).catch(err =>
                Logger.warn(`[ChatAgentDispatcher] onMessage error: ${err?.message || err}`),
            );
        });
    }

    /** Subscribe to the live incoming-message stream. Idempotent. */
    public start(): void {
        if (this.started) return;
        this.started = true;
        this.bind();
        Logger.log('[ChatAgentDispatcher] started');
    }

    /**
     * Re-attach the listener after EventBroadcaster.clearBeforeSendHooks() (workspace switch)
     * wiped it. Safe to call regardless of `started`; only re-binds if previously started.
     */
    public rehook(): void {
        if (!this.started) return;
        this.bind();
        Logger.log('[ChatAgentDispatcher] re-hooked after hooks cleared');
    }

    public stop(): void {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
        this.started = false;
        Logger.log('[ChatAgentDispatcher] stopped');
    }

    // ─── Incoming message ─────────────────────────────────────────────────

    private async onMessage(data: any): Promise<void> {
        // Payload mirrors WorkflowEngineService.flattenTriggerData('trigger.message'):
        //   data = { zaloId, message }, message = UserMessage|GroupMessage
        //   message.{ type:0|1, isSelf, threadId, data:{ uidFrom, msgId, ts, content, msgType } }
        const zaloId: string = data?.zaloId || '';
        const msg = data?.message || data?.data || {};
        const msgData = (msg as any).data || {};
        const threadId: string = (msg as any).threadId || msgData.idTo || '';
        if (!zaloId || !threadId) return;

        const isSelf = !!((msg as any).isSelf || data?.isSelf);
        const isGroup = (msg as any).type === 1 || !!(msg as any).isGroup;
        const mentions = msgData.mentions || (msg as any).mentions;
        const rawContent = this.extractContent(msgData, msg);

        if (isSelf) {
            this.handleSelfMessage(zaloId, threadId, rawContent, String(msgData.msgId || ''), isGroup);
            return;
        }

        // Strip the bot's OWN @mention so the AI answers the question, not the mentioned name
        // (e.g. "@Esta Leasing chào bạn" → "chào bạn"). Mentions of others are kept.
        const content = stripSelfMentions(rawContent, mentions, zaloId);
        // Ignore empty (sticker/media-only, or a bare @mention with no text).
        if (!content.trim()) return;

        const db = DatabaseService.getInstance();

        // ── Build routing inputs ──────────────────────────────────────────
        const agents = this.loadAgentRules(zaloId);
        if (!agents.length) return;

        const ctx = this.buildThreadCtx(zaloId, threadId, isGroup);
        let st = db.getConversationAiState(zaloId, threadId);

        // Auto-resume a HUMAN handoff after the owning agent's configured silence window.
        if (st?.paused) {
            const owner = decideChatReply(ctx, agents, { paused: false });
            const ownerAgent = owner.agentId != null ? this.findAgent(zaloId, owner.agentId) : null;
            if (ownerAgent && shouldAutoResume(st, ownerAgent.autoresume_minutes || 0, Date.now())) {
                db.setConversationAiState(zaloId, threadId, { paused: 0, paused_reason: '', paused_at: 0 });
                EventBroadcaster.emit('chatAgent:update', { zaloId, threadId, agentId: ownerAgent.id, type: 'resumed' });
                st = null;
            }
        }

        const decision = decideChatReply(ctx, agents, { paused: !!st?.paused });
        if (decision.skip || decision.agentId == null) return;

        const agent = this.findAgent(zaloId, decision.agentId);
        if (!agent) return;

        // In a GROUP, only engage when addressed (@mention or trigger keyword) — avoid
        // replying to every member message.
        if (isGroup) {
            const keywords = ((agent as any).trigger_keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            // mention detection uses the original mentions array; keyword check uses cleaned text.
            if (!groupTriggerMatched(content, mentions, zaloId, keywords)) return;
        }

        if (decision.mode === 'suggest') {
            // UI surfaces the suggestion; we don't auto-send (drafting handled in a later phase).
            EventBroadcaster.emit('chatAgent:suggestion', {
                zaloId, threadId, agentId: agent.id, threadType: isGroup ? 1 : 0,
            });
            return;
        }

        // ── mode === 'reply' ──────────────────────────────────────────────
        await this.reply(zaloId, threadId, isGroup, agent, content);
    }

    /** Extract human-readable text from a message payload (same rules as the workflow engine). */
    private extractContent(msgData: any, msg: any): string {
        const rawContent = msgData.content || (msg as any).content;
        const msgType = String(msgData.msgType || (msg as any).msgType || '');
        let content = String(
            (rawContent as any)?.msg ?? (typeof rawContent === 'string' ? rawContent : '') ?? '',
        );
        if (!content && rawContent && typeof rawContent === 'object') {
            if (msgType === 'chat.recommended' || msgType === 'chat.link') {
                content = String((rawContent as any).title || (rawContent as any).href || '');
            } else {
                content = String((rawContent as any).title || '');
            }
        }
        return content;
    }

    // ─── Routing inputs ───────────────────────────────────────────────────

    /** Map DB ChatAgent rows → resolver rules. */
    private loadAgentRules(zaloId: string): ChatAgentRule[] {
        const agents = DatabaseService.getInstance().listEnabledChatAgents(zaloId);
        return agents.map(a => this.toRule(a));
    }

    private toRule(a: ChatAgent): ChatAgentRule {
        return {
            id: a.id!,
            enabled: true, // listEnabledChatAgents already filters enabled=1
            threadIds: (a.thread_ids || []).map(String),
            // chat_agent_label.label_id is numeric → stringify so it matches ThreadCtx.labelIds.
            labelIds: (a.label_ids || []).map(String),
            isDefault: !!a.is_default,
            defaultScope: { dm: !!a.default_scope_dm, group: !!a.default_scope_group },
            defaultStrangerOnly: !!a.default_stranger_only,
            replyMode: a.reply_mode === 'suggest' ? 'suggest' : 'auto',
        };
    }

    private buildThreadCtx(zaloId: string, threadId: string, isGroup: boolean): ThreadCtx {
        const db = DatabaseService.getInstance();
        // Thread labels (local_label_threads.label_id is numeric → String() for resolver match).
        const labelIds = db.getLocalLabelThreads(zaloId)
            .filter(r => r.thread_id === threadId)
            .map(r => String(r.label_id));
        const isFriend = isGroup ? false : db.checkIsFriend(zaloId, threadId);
        const pinnedAgentId = db.getConversationAiState(zaloId, threadId)?.pinned_agent_id ?? null;
        return {
            threadId,
            threadType: isGroup ? 'group' : 'user',
            isFriend,
            labelIds,
            pinnedAgentId,
        };
    }

    /** Re-fetch the full ChatAgent row (needs assistant_id + autopause flag, not in the rule). */
    private findAgent(zaloId: string, agentId: number): ChatAgent | null {
        return DatabaseService.getInstance().listEnabledChatAgents(zaloId).find(a => a.id === agentId) || null;
    }

    // ─── Reply ────────────────────────────────────────────────────────────

    private async reply(zaloId: string, threadId: string, isGroup: boolean, agent: ChatAgent, currentText = ''): Promise<void> {
        const key = `${zaloId}|${threadId}`;
        if (this.processing.has(key)) return;

        // Min-delay throttle per thread (anti-loop / anti-spam).
        const now = Date.now();
        if (now - (this.lastReplyAt.get(key) ?? 0) < MIN_REPLY_DELAY_MS) {
            Logger.log(`[ChatAgentDispatcher] throttle ${key} — skip reply`);
            return;
        }

        const conn = ConnectionManager.getConnection(zaloId);
        if (!conn?.api) {
            Logger.warn(`[ChatAgentDispatcher] ${zaloId}: not connected — skip reply`);
            return;
        }
        if (!agent.assistant_id) {
            Logger.warn(`[ChatAgentDispatcher] agent ${agent.id}: no assistant — skip reply`);
            return;
        }

        this.processing.add(key);
        try {
            const db = DatabaseService.getInstance();
            const assistant = AIAssistantService.getInstance().getAssistant(agent.assistant_id);
            const contextCount = assistant?.contextMessageCount || DEFAULT_CONTEXT_COUNT;

            // getMessages returns newest→oldest; reverse to old→new for the LLM.
            const history = db.getMessages(zaloId, threadId, contextCount)
                .slice()
                .reverse()
                .map(m => ({
                    role: m.is_sent ? 'assistant' : 'user',
                    content: this.messageText(m),
                }))
                .filter(m => m.content.trim());

            // Ensure the current incoming question is the last user turn — the DB row for it
            // may not be persisted yet when this event fires, so append it if missing.
            const cur = (currentText || '').trim();
            const last = history[history.length - 1];
            if (cur && (!last || last.role !== 'user' || last.content.trim() !== cur)) {
                history.push({ role: 'user', content: cur });
            }

            if (!history.length) return;

            const { result } = await AIAssistantService.getInstance().chatForWorkflow(agent.assistant_id, history);
            const threadType = isGroup ? ThreadType.Group : ThreadType.User;
            const sentCount = await this.sendResult(conn.api, threadId, threadType, result);

            if (sentCount > 0) {
                this.lastReplyAt.set(key, Date.now());
                Logger.log(`[ChatAgentDispatcher] replied ${key} via agent ${agent.id} (${sentCount} segment(s))`);
                EventBroadcaster.emit('chatAgent:update', {
                    zaloId, threadId, agentId: agent.id, type: 'replied', sentCount,
                });
            }
        } finally {
            this.processing.delete(key);
        }
    }

    /** Best-effort plain text of a stored message (content may be JSON for rich types). */
    private messageText(m: { content: string; msg_type?: string }): string {
        const raw = m.content || '';
        if (!raw) return '';
        if (raw.trim().startsWith('{')) {
            try {
                const o = JSON.parse(raw);
                return String(o.msg || o.title || '');
            } catch { /* fall through */ }
        }
        return raw;
    }

    /**
     * Parse the assistant result into segments and send each to the thread.
     * Text segments → sendMessage; image segments → send each URL as plain text
     * (image upload from URL is handled by the workflow engine; here we keep it
     * simple and robust by forwarding the URL — richer media handling is a later phase).
     * Returns the number of segments actually sent.
     */
    private async sendResult(api: any, threadId: string, threadType: ThreadType, result: string): Promise<number> {
        const segments = parseStructuredResponse(result);
        let sent = 0;

        if (!segments) {
            // Plain text fallback.
            const text = (result || '').trim();
            if (!text) return 0;
            await api.sendMessage({ msg: text }, threadId, threadType);
            this.rememberAiSent(threadId, text);
            return 1;
        }

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (i > 0) await new Promise(r => setTimeout(r, 600));
            try {
                if (seg.type === 'text' && seg.content) {
                    const text = String(seg.content);
                    await api.sendMessage({ msg: text }, threadId, threadType);
                    this.rememberAiSent(threadId, text);
                    sent++;
                } else if (seg.type === 'image') {
                    const urls = Array.isArray(seg.content) ? seg.content : [seg.content];
                    for (const url of urls) {
                        if (!url || typeof url !== 'string') continue;
                        await api.sendMessage({ msg: String(url) }, threadId, threadType);
                        this.rememberAiSent(threadId, String(url));
                        sent++;
                    }
                }
            } catch (e: any) {
                Logger.warn(`[ChatAgentDispatcher] send segment failed: ${e.message}`);
            }
        }
        return sent;
    }

    // ─── Self message: echo detection + auto-pause ────────────────────────

    /**
     * A SELF message arrived. Two cases:
     *  - It matches something the AI just sent → echo, ignore (and best-effort tag sent_by='ai').
     *  - It does NOT match → a human typed by hand → auto-pause the thread if the
     *    responsible agent has autopause_on_human.
     */
    private handleSelfMessage(zaloId: string, threadId: string, content: string, msgId: string, isGroup: boolean): void {
        const text = (content || '').trim();
        if (!text) return;

        const key = this.aiKey(threadId, text);
        const exp = this.aiSentKeys.get(key);
        if (exp && exp > Date.now()) {
            // Echo of an AI-sent segment — consume it, do NOT auto-pause.
            this.aiSentKeys.delete(key);
            this.tagSentByAi(zaloId, msgId); // best-effort
            return;
        }

        // Echo guard: if the AI replied on this thread very recently, a non-matching self
        // message is most likely a reformatted echo (Zalo rewrites links/emoji) — not a human.
        // Skip auto-pause to avoid the AI pausing itself.
        if (Date.now() - (this.lastReplyAt.get(`${zaloId}|${threadId}`) ?? 0) < AI_SENT_TTL_MS) return;

        // Human typed by hand → auto-pause if the agent that owns this thread wants it.
        try {
            const db = DatabaseService.getInstance();
            const agents = this.loadAgentRules(zaloId);
            if (!agents.length) return;
            const ctx = this.buildThreadCtx(zaloId, threadId, isGroup);
            // Don't let an existing pause flip the routing; we just want the owning agent.
            const decision = decideChatReply(ctx, agents, { paused: false });
            if (decision.agentId == null) return;
            const agent = this.findAgent(zaloId, decision.agentId);
            if (agent?.autopause_on_human) {
                db.setConversationAiState(zaloId, threadId, {
                    paused: 1, paused_reason: 'human', paused_at: Date.now(),
                });
                Logger.log(`[ChatAgentDispatcher] auto-paused ${zaloId}|${threadId} (human reply)`);
                EventBroadcaster.emit('chatAgent:update', {
                    zaloId, threadId, agentId: agent.id, type: 'paused', reason: 'human',
                });
            }
        } catch (e: any) {
            Logger.warn(`[ChatAgentDispatcher] auto-pause error: ${e.message}`);
        }
    }

    /** Mark a stored message as AI-sent (messages.sent_by exists via migration). Guarded. */
    private tagSentByAi(zaloId: string, msgId: string): void {
        if (!msgId) return;
        try {
            DatabaseService.getInstance().run(
                `UPDATE messages SET sent_by='ai' WHERE owner_zalo_id=? AND msg_id=?`,
                [zaloId, msgId],
            );
        } catch (e: any) { Logger.warn(`[ChatAgentDispatcher] tagSentByAi: ${e.message}`); }
    }

    private rememberAiSent(threadId: string, text: string): void {
        this.aiSentKeys.set(this.aiKey(threadId, text), Date.now() + AI_SENT_TTL_MS);
        this.pruneAiSent();
    }

    private aiKey(threadId: string, text: string): string {
        // Normalize whitespace so minor echo reformatting still matches.
        return `${threadId}|${text.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    }

    private pruneAiSent(): void {
        if (this.aiSentKeys.size < 500) return;
        const now = Date.now();
        for (const [k, exp] of this.aiSentKeys) if (exp <= now) this.aiSentKeys.delete(k);
    }
}

export default ChatAgentDispatcher;
