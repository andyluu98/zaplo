/**
 * AgentSchedulerService
 *
 * Agent-centric replacement for PostingSchedulerService.
 * One timer per AGENT (keyed by agentId). Each agent owns its account, groups,
 * topics, AI assistant, schedule rules (daily/weekly/monthly/once) and image policy.
 *
 * Per tick: resolve today's slots → when due, get/generate a draft → post to the
 * agent's groups (with images) → log. `once` rules are consumed after firing.
 */

import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import EventBroadcaster from '../event/EventBroadcaster';
import ContentDraftGenerator from './content-draft-generator';
import { resolveSlotsForDay, ResolvedSlot } from './schedule-resolver';
import { resolveAgentImagePaths, sendDraftToGroup } from './posting-sender';
import { MAX_POSTS_PER_DAY } from './posting-scheduler-service';
import Logger from '../../utils/Logger';
import type { PostingAgent } from '../../models';

class AgentSchedulerService {
    private static instance: AgentSchedulerService;

    private timers       = new Map<number, ReturnType<typeof setInterval>>();
    private lastSentAt   = new Map<number, number>();
    private isProcessing = new Map<number, boolean>();
    private tokens       = new Map<number, number>();
    private lastRefillAt = new Map<number, number>();
    private slots        = new Map<number, ResolvedSlot[]>();
    private planDay      = new Map<number, string>();
    private lastError    = new Map<number, string>();   // last runtime failure reason (cleared on success)

    public readonly MAX_TOKENS = 20;
    private readonly REFILL_MS = 3 * 60 * 1000;   // 1 token / 3 min → 20/hr
    private readonly CHECK_MS  = 10_000;          // tick every 10s
    private readonly MIN_DELAY = 30_000;          // min 30s between sends

    public static getInstance(): AgentSchedulerService {
        if (!AgentSchedulerService.instance) AgentSchedulerService.instance = new AgentSchedulerService();
        return AgentSchedulerService.instance;
    }

    public startForAgent(agentId: number): void {
        if (this.timers.has(agentId)) return;
        Logger.log(`[AgentScheduler] start agent ${agentId}`);
        if (!this.tokens.has(agentId)) { this.tokens.set(agentId, this.MAX_TOKENS); this.lastRefillAt.set(agentId, Date.now()); }
        this.timers.set(agentId, setInterval(() => this.tick(agentId), this.CHECK_MS));
        EventBroadcaster.emit('postingBot:update', { agentId, type: 'started', ...this.buildStatus(agentId) });
    }

    public stopForAgent(agentId: number): void {
        const t = this.timers.get(agentId);
        if (t) { clearInterval(t); this.timers.delete(agentId); }
        this.isProcessing.delete(agentId); this.slots.delete(agentId); this.planDay.delete(agentId);
        Logger.log(`[AgentScheduler] stop agent ${agentId}`);
        EventBroadcaster.emit('postingBot:update', { agentId, type: 'stopped', ...this.buildStatus(agentId) });
    }

    public resetPlan(agentId: number): void { this.slots.delete(agentId); this.planDay.delete(agentId); }

    public resumeActiveAgents(): void {
        try {
            const db = DatabaseService.getInstance();
            const removed = db.cleanupExpiredOnceSchedules();
            if (removed > 0) Logger.log(`[AgentScheduler] cleaned ${removed} expired once-schedule(s)`);
            for (const a of db.listEnabledAgents()) { if (a.id) this.startForAgent(a.id); }
        } catch (err: any) { Logger.warn(`[AgentScheduler] resume: ${err.message}`); }
    }

    public getStatus(agentId: number) { return this.buildStatus(agentId); }

    private buildStatus(agentId: number) {
        const db = DatabaseService.getInstance();
        const agent = db.getPostingAgent(agentId);
        const zaloId = agent?.owner_zalo_id || '';
        let pending = 0, approved = 0;
        try { pending = db.getContentDrafts(zaloId, 'pending', agentId).length; approved = db.getContentDrafts(zaloId, 'approved', agentId).length; } catch {}
        const s = this.slots.get(agentId) || [];
        const last = this.lastSentAt.get(agentId) ?? 0;
        return {
            running: this.timers.has(agentId),
            tokens: this.tokens.get(agentId) ?? this.MAX_TOKENS, maxTokens: this.MAX_TOKENS,
            nextRunAt: s.length ? s[0].at : null, lastRunAt: last || null,
            pendingDrafts: pending, approvedDrafts: approved,
            lastError: this.lastError.get(agentId) || null,
        };
    }

    private refill(agentId: number): void {
        const now = Date.now(); const last = this.lastRefillAt.get(agentId) || now;
        const add = Math.floor((now - last) / this.REFILL_MS);
        if (add > 0) { this.tokens.set(agentId, Math.min(this.MAX_TOKENS, (this.tokens.get(agentId) ?? 0) + add)); this.lastRefillAt.set(agentId, last + add * this.REFILL_MS); }
    }

    private ensurePlan(agentId: number, agent: PostingAgent): void {
        const today = new Date(); const key = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        if (this.planDay.get(agentId) === key && this.slots.has(agentId)) return;
        const resolved = resolveSlotsForDay(agent.schedules || [], Date.now());
        this.slots.set(agentId, resolved); this.planDay.set(agentId, key);
        Logger.log(`[AgentScheduler] agent ${agentId} plan ${key}: ${resolved.length} slot(s)`);
    }

    private async tick(agentId: number): Promise<void> {
        if (this.isProcessing.get(agentId)) return;
        const db = DatabaseService.getInstance();
        const agent = db.getPostingAgent(agentId);
        if (!agent || !agent.enabled) return;

        this.ensurePlan(agentId, agent);
        this.refill(agentId);

        const slots = this.slots.get(agentId) || [];
        const now = Date.now();
        if (!slots.length || slots[0].at > now) return;
        if ((this.tokens.get(agentId) ?? 0) <= 0) return;
        if (now - (this.lastSentAt.get(agentId) ?? 0) < this.MIN_DELAY) return;

        const zaloId = agent.owner_zalo_id;
        const conn = ConnectionManager.getConnection(zaloId);
        if (!conn?.api) { this.lastError.set(agentId, 'Tài khoản Zalo chưa kết nối'); Logger.warn(`[AgentScheduler] agent ${agentId}: tài khoản chưa kết nối — hoãn`); return; }

        const groupIds = agent.group_ids || [];
        if (!groupIds.length) { Logger.warn(`[AgentScheduler] agent ${agentId}: chưa chọn nhóm`); return; }

        const slot = slots[0];
        this.isProcessing.set(agentId, true);
        try {
            // Resolve a draft: oldest approved for this agent, else (auto) generate one now.
            let draft = this.oldestApproved(agentId, zaloId);
            if (!draft) {
                if (agent.approval_mode === 'auto') draft = await this.generateApproved(agent);
                if (!draft) { slots.shift(); this.slots.set(agentId, slots); Logger.warn(`[AgentScheduler] agent ${agentId}: không có bài để đăng — bỏ slot`); return; }
            }

            slots.shift(); this.slots.set(agentId, slots);

            const rule = (agent.schedules || []).find(s => s.id === slot.scheduleId);
            const cap = Math.min(rule?.posts_per_day ?? 1, MAX_POSTS_PER_DAY);
            const imagePaths = resolveAgentImagePaths(zaloId, agent, draft);

            let sent = 0;
            for (let gi = 0; gi < groupIds.length; gi++) {
                const groupId = groupIds[gi];
                try { if (db.countPostsToday(zaloId, groupId, agentId) >= cap) { Logger.log(`[AgentScheduler] agent ${agentId} group ${groupId}: cap`); continue; } }
                catch { continue; }
                if (gi > 0) await new Promise(r => setTimeout(r, this.MIN_DELAY + Math.random() * 10_000));
                if (await sendDraftToGroup(conn.api, { zaloId, agentId, draftId: draft.id!, text: draft.text, groupId, imagePaths })) sent++;
            }

            if (sent > 0) { db.updateDraftStatus(zaloId, draft.id!, 'posted'); this.lastError.delete(agentId); }
            else this.lastError.set(agentId, 'Tất cả nhóm gửi thất bại');
            if (slot.kind === 'once') db.deleteAgentSchedule(slot.scheduleId); // consume one-off

            this.tokens.set(agentId, Math.max(0, (this.tokens.get(agentId) ?? 1) - 1));
            this.lastSentAt.set(agentId, Date.now());
            EventBroadcaster.emit('postingBot:update', { agentId, type: 'slot_done', sentCount: sent, ...this.buildStatus(agentId) });
        } catch (err: any) {
            this.lastError.set(agentId, err.message || 'Lỗi không xác định');
            Logger.error(`[AgentScheduler] agent ${agentId}: tick error: ${err.message}`);
        } finally {
            this.isProcessing.set(agentId, false);
        }
    }

    private oldestApproved(agentId: number, zaloId: string) {
        const drafts = DatabaseService.getInstance().getContentDrafts(zaloId, 'approved', agentId);
        if (!drafts.length) return null;
        // True FIFO: oldest by created_at (fallback id), not updated_at.
        return [...drafts].sort((a, b) => (a.created_at ?? a.id ?? 0) - (b.created_at ?? b.id ?? 0))[0];
    }

    private async generateApproved(agent: PostingAgent) {
        const pillars = agent.pillar_ids || [];
        if (!pillars.length) { Logger.warn(`[AgentScheduler] agent ${agent.id}: chưa gán chủ đề — không sinh được bài`); return null; }
        const pillarId = pillars[Math.floor(Math.random() * pillars.length)];
        try {
            const ids = await ContentDraftGenerator.getInstance().generateDrafts(agent.owner_zalo_id, pillarId, 1, { agentId: agent.id, agentAssistantId: agent.assistant_id, approve: true });
            if (!ids.length) return null;
            return DatabaseService.getInstance().getContentDraft(agent.owner_zalo_id, ids[0]);
        } catch (err: any) { Logger.error(`[AgentScheduler] agent ${agent.id}: generate failed: ${err.message}`); return null; }
    }

    /** Post a specific (or oldest approved) draft to the agent's groups now, ignoring schedule. */
    public async postNow(agentId: number, draftId?: number): Promise<{ ok: boolean; sentCount: number; total: number; postedText?: string; error?: string }> {
        const db = DatabaseService.getInstance();
        const agent = db.getPostingAgent(agentId);
        if (!agent) return { ok: false, sentCount: 0, total: 0, error: 'Không tìm thấy agent' };
        const zaloId = agent.owner_zalo_id;
        const groupIds = agent.group_ids || [];
        if (!groupIds.length) return { ok: false, sentCount: 0, total: 0, error: 'Agent chưa chọn nhóm' };

        let draft = draftId ? db.getContentDraft(zaloId, draftId) : this.oldestApproved(agentId, zaloId);
        if (!draft) {
            if (agent.approval_mode === 'auto') draft = await this.generateApproved(agent);
            if (!draft) return { ok: false, sentCount: 0, total: groupIds.length, error: 'Không có bài để đăng (duyệt hoặc sinh bài trước)' };
        }
        const conn = ConnectionManager.getConnection(zaloId);
        if (!conn?.api) { this.lastError.set(agentId, 'Tài khoản Zalo chưa kết nối'); return { ok: false, sentCount: 0, total: groupIds.length, error: 'Tài khoản chưa kết nối Zalo' }; }

        const imagePaths = resolveAgentImagePaths(zaloId, agent, draft);
        let sent = 0;
        for (let gi = 0; gi < groupIds.length; gi++) {
            if (gi > 0) await new Promise(r => setTimeout(r, 2000));
            if (await sendDraftToGroup(conn.api, { zaloId, agentId, draftId: draft.id!, text: draft.text, groupId: groupIds[gi], imagePaths })) sent++;
        }
        if (sent > 0) { db.updateDraftStatus(zaloId, draft.id!, 'posted'); this.lastError.delete(agentId); }
        else this.lastError.set(agentId, 'Tất cả nhóm gửi thất bại');
        EventBroadcaster.emit('postingBot:update', { agentId, type: 'slot_done', sentCount: sent, ...this.buildStatus(agentId) });
        return { ok: sent > 0, sentCount: sent, total: groupIds.length, postedText: draft.text?.slice(0, 60), error: sent > 0 ? undefined : 'Tất cả nhóm gửi thất bại' };
    }
}

export default AgentSchedulerService;
