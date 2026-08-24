/**
 * ChatAgentDispatcher — MAIN-process service that auto-replies to incoming
 * customer messages using a Chat Agent (assistant + routing rules).
 *
 * Channel-agnostic since Phase 1: it consumes a normalised `ChannelEvent` off
 * `event:channelMessage` and resolves every account-keyed data access through a
 * ChannelContextProvider and every send through a ChannelSender. Zalo is one
 * channel (bridged from the legacy `event:message` by ZaloChannelAdapter); Page
 * (Phase 2/3) is another. Nothing here references zaloId, DatabaseService,
 * ConnectionManager or api.sendMessage directly.
 *
 * Flow per incoming message on thread T (account A, channel C):
 *   1. Skip own/AI echoes (isSelf) — but use them to auto-pause on human reply.
 *   2. Build ThreadCtx (type, friend, labels, pin) + load enabled agents (rules).
 *   3. decideChatReply() → skip | suggest | reply.
 *   4. reply → load history → chatForWorkflow() → parse segments → sender.send().
 *
 * All per-thread state maps are keyed `channel:accountId:threadId[:senderId]` so
 * two channels (or two accounts) never collide, and rehook() clears them all.
 */

import EventBroadcaster from '../event/EventBroadcaster';
import AIAssistantService from '../ai/AIAssistantService';
import { parseStructuredResponse } from '../../utils/aiUtils';
import { delay } from '../../utils/delay';
import { decideChatReply, shouldAutoResume, groupTriggerMatched, stripSelfMentions, stripSelfMentionText } from './chat-agent-decider';
import { MessageAggregator } from './message-aggregator';
import type { ChatAgentRule, ThreadCtx } from './chat-agent-resolver';
import type { ChatAgent } from '../../models';
import type { AIStructuredSegment } from '../../utils/aiUtils';
import type { ChatChannel, ChannelEvent, ChannelContextProvider } from './channel-event';
import { channelProviderRegistry, channelSenderRegistry } from './channel-sender-registry';
import { ZaloContextProvider } from './channel-context/zalo-context-provider';
import { ZaloSender } from './senders/zalo-sender';
import ZaloChannelAdapter from './adapters/zalo-channel-adapter';
import { PageContextProvider } from './channel-context/page-context-provider';
import { pageSendService } from '../facebook-page/page-send-service';
import Logger from '../../utils/Logger';

/** Window (ms) for treating a SELF message as an echo of something the AI just sent. */
const AI_SENT_TTL_MS = 60_000;
/** Min delay between two AI replies on the SAME thread (anti-loop floor; smaller than the
 *  debounce window so a normal debounced flush is never dropped). */
const MIN_REPLY_DELAY_MS = 2_000;
/** Default number of past messages fed to the assistant when the assistant has none configured. */
const DEFAULT_CONTEXT_COUNT = 30;

class ChatAgentDispatcher {
    private static instance: ChatAgentDispatcher;

    private started = false;
    private channelsRegistered = false;
    private unsubscribe: (() => void) | null = null;

    /** `channel:accountId:threadId|normContent` → expiry ts. Marks text the AI just sent, so its echo is ignored. */
    private aiSentKeys = new Map<string, number>();
    /** replyKey → last AI reply ts (min-delay throttle). */
    private lastReplyAt = new Map<string, number>();
    /** Reply keys currently being processed — prevents concurrent double-replies. */
    private processing = new Set<string>();
    /** Debounce buffer — gom tin khách gửi ngắt quãng thành 1 lượt trước khi trả lời. */
    private aggregator = new MessageAggregator();
    /** Per-thread reply queue — flushed turns wait here and are sent sequentially (never dropped). */
    private replyQueue = new Map<string, string[]>();
    /** Reply keys with a drain loop running (so a second flush appends instead of racing). */
    private draining = new Set<string>();

    public static getInstance(): ChatAgentDispatcher {
        if (!ChatAgentDispatcher.instance) ChatAgentDispatcher.instance = new ChatAgentDispatcher();
        return ChatAgentDispatcher.instance;
    }

    /** Register the built-in channels (provider + sender). Idempotent. */
    private registerChannels(): void {
        if (this.channelsRegistered) return;
        channelProviderRegistry.register('zalo', new ZaloContextProvider());
        channelSenderRegistry.register('zalo', new ZaloSender());
        // Page (Phase 4 activation): inbound events already flow from Phase 3; wiring
        // the provider + sender turns replies on. No Zalo path is touched.
        channelProviderRegistry.register('page', new PageContextProvider());
        channelSenderRegistry.register('page', pageSendService);
        this.channelsRegistered = true;
    }

    /** Bind the 'event:channelMessage' listener (idempotent on unsubscribe handle). */
    private bind(): void {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = EventBroadcaster.onBeforeSend('event:channelMessage', (data: ChannelEvent) => {
            // Never let a handler error bubble into the broadcaster.
            Promise.resolve(this.onEvent(data)).catch(err =>
                Logger.warn(`[ChatAgentDispatcher] onEvent error: ${err?.message || err}`),
            );
        });
    }

    /** Subscribe to the live incoming-message stream. Idempotent. */
    public start(): void {
        if (this.started) return;
        this.started = true;
        this.registerChannels();
        ZaloChannelAdapter.getInstance().start();
        this.bind();
        Logger.log('[ChatAgentDispatcher] started');
    }

    /**
     * Re-attach listeners after EventBroadcaster.clearBeforeSendHooks() (workspace switch)
     * wiped them, and drop all per-thread state so a new workspace never inherits the old
     * one's debounce/echo/throttle maps (red-team M6). Safe to call regardless of `started`.
     */
    public rehook(): void {
        if (!this.started) return;
        ZaloChannelAdapter.getInstance().rehook();
        this.bind();
        this.aggregator.clear();
        this.replyQueue.clear();
        this.draining.clear();
        this.processing.clear();
        this.lastReplyAt.clear();
        this.aiSentKeys.clear();
        Logger.log('[ChatAgentDispatcher] re-hooked after hooks cleared');
    }

    public stop(): void {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
        ZaloChannelAdapter.getInstance().stop();
        this.aggregator.clear();
        this.replyQueue.clear();
        this.draining.clear();
        this.processing.clear();
        this.lastReplyAt.clear();
        this.aiSentKeys.clear();
        this.started = false;
        Logger.log('[ChatAgentDispatcher] stopped');
    }

    // ─── Incoming message ─────────────────────────────────────────────────

    private async onEvent(evt: ChannelEvent): Promise<void> {
        const { channel, accountId, threadId } = evt;
        if (!accountId || !threadId) return;
        const provider = channelProviderRegistry.pick(channel);
        if (!provider) return;

        const isGroup = evt.threadType === 'group';
        const rawContent = evt.text;

        if (evt.isSelf) {
            this.handleSelfMessage(channel, provider, accountId, threadId, rawContent, evt.msgId || '', isGroup);
            return;
        }

        // Strip the bot's OWN @mention so the AI answers the question, not the mentioned name
        // (e.g. "@Esta Leasing chào bạn" → "chào bạn"). Mentions of others are kept.
        const content = stripSelfMentions(rawContent, evt.mentions, accountId);
        // Ignore empty (sticker/media-only, or a bare @mention with no text) — UNLESS the
        // message carries images (a caption-less photo the vision model should answer).
        const hasImages = !!(evt.images && evt.images.length);
        if (!content.trim() && !hasImages) return;

        // ── Build routing inputs ──────────────────────────────────────────
        const agents = this.loadAgentRules(provider, accountId);
        if (!agents.length) return;

        const ctx = this.buildThreadCtx(provider, accountId, threadId, isGroup);
        let st = provider.getAiState(accountId, threadId);

        // Auto-resume a HUMAN handoff after the owning agent's configured silence window.
        if (st?.paused) {
            const owner = decideChatReply(ctx, agents, { paused: false });
            const ownerAgent = owner.agentId != null ? this.findAgent(provider, accountId, owner.agentId) : null;
            if (ownerAgent && shouldAutoResume(st, ownerAgent.autoresume_minutes || 0, Date.now())) {
                provider.setAiState(accountId, threadId, { paused: 0, paused_reason: '', paused_at: 0 });
                EventBroadcaster.emit('chatAgent:update', { channel, zaloId: accountId, accountId, threadId, agentId: ownerAgent.id, type: 'resumed' });
                st = null;
            }
        }

        const decision = decideChatReply(ctx, agents, { paused: !!st?.paused });
        if (decision.skip || decision.agentId == null) return;

        const agent = this.findAgent(provider, accountId, decision.agentId);
        if (!agent) return;

        // Buffer key: per-SENDER in a group (so one member's chatter never merges into another
        // member's addressed turn), per-thread in a DM. Reply/throttle stay keyed per-thread.
        const bufKey = isGroup
            ? this.mapKey(channel, accountId, threadId, evt.senderId)
            : this.mapKey(channel, accountId, threadId);

        // In a GROUP, only engage when addressed. The FIRST fragment of a turn must address
        // the bot (@mention or trigger keyword); once a turn is being buffered, subsequent
        // quick fragments from the SAME sender join even without re-tagging.
        if (isGroup && !this.aggregator.hasPending(bufKey)) {
            const keywords = (agent.trigger_keywords || '').split(',').map(s => s.trim()).filter(Boolean);
            // mention detection uses the original mentions array; keyword check uses cleaned text.
            if (!groupTriggerMatched(content, evt.mentions, accountId, keywords)) return;
        }

        if (decision.mode === 'suggest') {
            // UI surfaces the suggestion; we don't auto-send (drafting handled in a later phase).
            EventBroadcaster.emit('chatAgent:suggestion', {
                channel, zaloId: accountId, accountId, threadId, agentId: agent.id, threadType: isGroup ? 1 : 0,
            });
            return;
        }

        // ── mode === 'reply' ──────────────────────────────────────────────
        // Gom tin ngắt quãng: chờ khách im DEBOUNCE_MS rồi xếp vào hàng đợi trả lời 1 lần.
        // `force` khi tin chỉ có ảnh (text rỗng) → vẫn flush để trả lời tin ảnh.
        this.aggregator.enqueue(bufKey, content, combined =>
            this.enqueueReply(channel, provider, accountId, threadId, isGroup, agent, combined),
            hasImages && !content.trim(),
        );
    }

    // ─── Routing inputs ───────────────────────────────────────────────────

    /** Map enabled ChatAgent rows → resolver rules. */
    private loadAgentRules(provider: ChannelContextProvider, accountId: string): ChatAgentRule[] {
        return provider.getAgents(accountId).map(a => this.toRule(a));
    }

    private toRule(a: ChatAgent): ChatAgentRule {
        return {
            id: a.id!,
            enabled: true, // getAgents already filters enabled=1
            threadIds: (a.thread_ids || []).map(String),
            // chat_agent_label.label_id is numeric → stringify so it matches ThreadCtx.labelIds.
            labelIds: (a.label_ids || []).map(String),
            isDefault: !!a.is_default,
            defaultScope: { dm: !!a.default_scope_dm, group: !!a.default_scope_group },
            defaultStrangerOnly: !!a.default_stranger_only,
            replyMode: a.reply_mode === 'suggest' ? 'suggest' : 'auto',
        };
    }

    private buildThreadCtx(provider: ChannelContextProvider, accountId: string, threadId: string, isGroup: boolean): ThreadCtx {
        const labelIds = provider.getLabelThreads(accountId, threadId);
        const isFriend = isGroup ? false : provider.isFriend(accountId, threadId);
        const pinnedAgentId = provider.getAiState(accountId, threadId)?.pinned_agent_id ?? null;
        return {
            threadId,
            threadType: isGroup ? 'group' : 'user',
            isFriend,
            labelIds,
            pinnedAgentId,
        };
    }

    /** Re-fetch the full ChatAgent row (needs assistant_id + autopause flag, not in the rule). */
    private findAgent(provider: ChannelContextProvider, accountId: string, agentId: number): ChatAgent | null {
        return provider.getAgents(accountId).find(a => a.id === agentId) || null;
    }

    // ─── Reply ────────────────────────────────────────────────────────────

    /**
     * Queue a flushed turn for sending and ensure a drain loop is running. Turns are sent
     * sequentially per thread so a turn is NEVER dropped because a prior reply is in flight
     * or the anti-spam throttle hasn't elapsed (the throttle becomes a delay, not a drop).
     */
    private enqueueReply(channel: ChatChannel, provider: ChannelContextProvider, accountId: string, threadId: string, isGroup: boolean, agent: ChatAgent, combined: string): void {
        const key = this.mapKey(channel, accountId, threadId);
        const q = this.replyQueue.get(key) ?? [];
        q.push(combined);
        this.replyQueue.set(key, q);
        if (!this.draining.has(key)) void this.drain(channel, provider, accountId, threadId, isGroup, agent, key);
    }

    /** Drain a thread's reply queue one turn at a time, spacing sends by MIN_REPLY_DELAY_MS. */
    private async drain(channel: ChatChannel, provider: ChannelContextProvider, accountId: string, threadId: string, isGroup: boolean, agent: ChatAgent, key: string): Promise<void> {
        this.draining.add(key);
        try {
            for (;;) {
                const q = this.replyQueue.get(key);
                if (!q || q.length === 0) break;
                const combined = q.shift()!;
                if (q.length === 0) this.replyQueue.delete(key);
                // Throttle as DELAY (not drop): keep at least MIN_REPLY_DELAY_MS between sends.
                const wait = MIN_REPLY_DELAY_MS - (Date.now() - (this.lastReplyAt.get(key) ?? 0));
                if (wait > 0) await delay(wait);
                try {
                    await this.reply(channel, provider, accountId, threadId, isGroup, agent, combined);
                } catch (err) {
                    Logger.warn(`[ChatAgentDispatcher] reply error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        } finally {
            this.draining.delete(key);
        }
    }

    private async reply(channel: ChatChannel, provider: ChannelContextProvider, accountId: string, threadId: string, isGroup: boolean, agent: ChatAgent, currentText = ''): Promise<void> {
        const key = this.mapKey(channel, accountId, threadId);
        if (this.processing.has(key)) return; // concurrency guard (drain serializes, so normally never trips)

        const sender = channelSenderRegistry.pick(channel);
        if (!sender) {
            Logger.warn(`[ChatAgentDispatcher] no sender for channel ${channel} — skip reply`);
            return;
        }
        if (sender.isReady && !sender.isReady(accountId)) {
            Logger.warn(`[ChatAgentDispatcher] ${channel}:${accountId} not connected — skip reply`);
            return;
        }

        this.processing.add(key);
        try {
            // Re-check pause: a human may have taken over during the debounce window.
            if (provider.getAiState(accountId, threadId)?.paused) {
                Logger.log(`[ChatAgentDispatcher] ${key} paused during debounce — skip reply`);
                return;
            }
            // Re-validate the agent at flush time — it may have been disabled / lost its assistant
            // during the debounce window (the captured row is stale).
            const fresh = this.findAgent(provider, accountId, agent.id!);
            if (!fresh || !fresh.assistant_id) {
                Logger.log(`[ChatAgentDispatcher] agent ${agent.id} no longer active — skip reply`);
                return;
            }
            agent = fresh;
            const assistantId = fresh.assistant_id; // narrowed to string by the guard above
            const assistant = AIAssistantService.getInstance().getAssistant(assistantId);
            const contextCount = assistant?.contextMessageCount || DEFAULT_CONTEXT_COUNT;

            // Strip the bot's own @mention from history too (stored content keeps "@<name> …";
            // no TMention pos/len in the DB) so the assistant answers instead of "correcting" the
            // addressed name across past turns. Name-agnostic — uses the account's display name.
            const selfName = provider.getAccountName(accountId);

            const history = provider.getHistory(accountId, threadId, contextCount)
                .map(m => {
                    const content = m.role === 'user' ? stripSelfMentionText(m.content, selfName) : m.content;
                    // Carry customer image URLs through to the vision model. An image-only
                    // turn (no caption) must survive the empty-text filter below.
                    return m.images && m.images.length
                        ? { role: m.role, content, images: m.images }
                        : { role: m.role, content };
                })
                .filter(m => m.content.trim() || ('images' in m && (m as any).images?.length));

            // Ensure the current incoming question is the last user turn — the DB row for it
            // may not be persisted yet when this event fires, so append it if missing.
            const cur = (currentText || '').trim();
            const last = history[history.length - 1];
            if (cur && (!last || last.role !== 'user' || last.content.trim() !== cur)) {
                history.push({ role: 'user', content: cur });
            }

            if (!history.length) return;

            // Thinking is per-call and Page-only: the DeepSeek `thinking` param would
            // corrupt the structured-JSON contract the Zalo path relies on (red-team H5),
            // so Zalo passes thinking:false and behaves exactly as before.
            const wantThinking = channel === 'page';
            const { result, reasoning } = await AIAssistantService.getInstance()
                .chatForWorkflow(assistantId, history, { thinking: wantThinking });
            // Persist the chain-of-thought for debugging only — never sent to the customer,
            // never synced to employees (ai_reasoning_log is outside SYNCABLE_TABLES). msgId
            // is not threaded into the debounce path yet; thread-level is enough for review.
            if (reasoning) {
                AIAssistantService.getInstance().logReasoning({
                    channel, accountId, threadId, msgId: '', assistantId, reasoning,
                });
            }
            const segments = this.buildSegments(result);
            if (!segments.length) return;

            const res = await sender.send({
                accountId, threadId, threadType: isGroup ? 'group' : 'user', segments,
            });
            for (const t of res.sentTexts) this.rememberAiSent(channel, accountId, threadId, t);

            if (res.sentCount > 0) {
                this.lastReplyAt.set(key, Date.now());
                Logger.log(`[ChatAgentDispatcher] replied ${key} via agent ${agent.id} (${res.sentCount} segment(s))`);
                EventBroadcaster.emit('chatAgent:update', {
                    channel, zaloId: accountId, accountId, threadId, agentId: agent.id, type: 'replied', sentCount: res.sentCount,
                });
            }
        } finally {
            this.processing.delete(key);
        }
    }

    /**
     * Parse the assistant result into segments. A structured JSON reply becomes its
     * text/image segments (preserved as-is, empty array = nothing to send); a plain
     * reply becomes a single text segment.
     */
    private buildSegments(result: string): AIStructuredSegment[] {
        const parsed = parseStructuredResponse(result);
        if (parsed) return parsed;
        const text = (result || '').trim();
        return text ? [{ type: 'text', content: text }] : [];
    }

    // ─── Self message: echo detection + auto-pause ────────────────────────

    /**
     * A SELF message arrived. Two cases:
     *  - It matches something the AI just sent → echo, ignore (and best-effort tag sent_by='ai').
     *  - It does NOT match → a human typed by hand → auto-pause the thread if the
     *    responsible agent has autopause_on_human.
     */
    private handleSelfMessage(channel: ChatChannel, provider: ChannelContextProvider, accountId: string, threadId: string, content: string, msgId: string, isGroup: boolean): void {
        const text = (content || '').trim();
        if (!text) return;

        const key = this.aiEchoKey(channel, accountId, threadId, text);
        const exp = this.aiSentKeys.get(key);
        if (exp && exp > Date.now()) {
            // Echo of an AI-sent segment — consume it, do NOT auto-pause.
            this.aiSentKeys.delete(key);
            provider.tagSentByAi(accountId, msgId); // best-effort
            return;
        }

        // Echo guard: if the AI replied on this thread very recently, a non-matching self
        // message is most likely a reformatted echo (links/emoji rewritten) — not a human.
        // Skip auto-pause to avoid the AI pausing itself.
        if (Date.now() - (this.lastReplyAt.get(this.mapKey(channel, accountId, threadId)) ?? 0) < AI_SENT_TTL_MS) return;

        // Human typed by hand → auto-pause if the agent that owns this thread wants it.
        try {
            const agents = this.loadAgentRules(provider, accountId);
            if (!agents.length) return;
            const ctx = this.buildThreadCtx(provider, accountId, threadId, isGroup);
            // Don't let an existing pause flip the routing; we just want the owning agent.
            const decision = decideChatReply(ctx, agents, { paused: false });
            if (decision.agentId == null) return;
            const agent = this.findAgent(provider, accountId, decision.agentId);
            if (agent?.autopause_on_human) {
                provider.setAiState(accountId, threadId, {
                    paused: 1, paused_reason: 'human', paused_at: Date.now(),
                });
                Logger.log(`[ChatAgentDispatcher] auto-paused ${channel}:${accountId}:${threadId} (human reply)`);
                EventBroadcaster.emit('chatAgent:update', {
                    channel, zaloId: accountId, accountId, threadId, agentId: agent.id, type: 'paused', reason: 'human',
                });
            }
        } catch (e) {
            Logger.warn(`[ChatAgentDispatcher] auto-pause error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private rememberAiSent(channel: ChatChannel, accountId: string, threadId: string, text: string): void {
        this.aiSentKeys.set(this.aiEchoKey(channel, accountId, threadId, text), Date.now() + AI_SENT_TTL_MS);
        this.pruneAiSent();
    }

    // ─── Keys ───────────────────────────────────────────────────────────────

    /** State-map key: `channel:accountId:threadId` (+ `:senderId` for group buffers). */
    private mapKey(channel: ChatChannel, accountId: string, threadId: string, senderId?: string): string {
        const base = `${channel}:${accountId}:${threadId}`;
        return senderId ? `${base}:${senderId}` : base;
    }

    /** Echo-suppression key: normalise whitespace so minor echo reformatting still matches. */
    private aiEchoKey(channel: ChatChannel, accountId: string, threadId: string, text: string): string {
        return `${channel}:${accountId}:${threadId}|${text.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    }

    private pruneAiSent(): void {
        if (this.aiSentKeys.size < 500) return;
        const now = Date.now();
        for (const [k, exp] of this.aiSentKeys) if (exp <= now) this.aiSentKeys.delete(k);
    }
}

export default ChatAgentDispatcher;
