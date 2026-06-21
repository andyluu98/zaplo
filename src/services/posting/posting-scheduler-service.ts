/**
 * PostingSchedulerService
 *
 * Per-account scheduler for the Group Posting Bot.
 * Clones the CRMQueueService token-bucket + per-account timer pattern.
 *
 * Primary limit: posts_per_day (1-3) per group/per day, enforced via countPostsToday.
 * Safety throttle: token bucket (MAX_TOKENS/hour).
 * Daily plan: N random time-points in [window_start, window_end] chosen once per day.
 */

import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import EventBroadcaster from '../event/EventBroadcaster';
import FileStorageService from '../file/FileStorageService';
import Logger from '../../utils/Logger';
import { ThreadType } from 'zca-js';

// ─── Pure helper — independently testable ────────────────────────────────────

/**
 * Choose `postsPerDay` random epoch-ms slots within [windowStart, windowEnd] today.
 * Only returns slots in the future (> nowMs).
 * Pure: no Date.now() inside — caller passes nowMs.
 *
 * @param windowStart "HH:MM" string
 * @param windowEnd   "HH:MM" string
 * @param postsPerDay 1..3
 * @param nowMs       current epoch ms (injected for purity/testability)
 * @returns sorted array of future epoch-ms slot times (may be empty if window already passed)
 */
export function planDailySlots(
    windowStart: string,
    windowEnd: string,
    postsPerDay: number,
    nowMs: number,
): number[] {
    const parseHHMM = (hhmm: string, baseMs: number): number => {
        const [hh, mm] = hhmm.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return baseMs;
        const d = new Date(baseMs);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
    };

    const startMs = parseHHMM(windowStart, nowMs);
    const endMs   = parseHHMM(windowEnd, nowMs);

    if (endMs <= startMs) return [];

    const count = Math.max(1, Math.min(3, postsPerDay));
    const slots: number[] = [];

    for (let i = 0; i < count; i++) {
        const slot = startMs + Math.random() * (endMs - startMs);
        slots.push(Math.floor(slot));
    }

    return slots
        .sort((a, b) => a - b)
        .filter(s => s > nowMs);
}

// ─── Service ─────────────────────────────────────────────────────────────────

class PostingSchedulerService {
    private static instance: PostingSchedulerService;

    // Per-account timer driving the CHECK_INTERVAL_MS tick
    private timers:       Map<string, ReturnType<typeof setInterval>> = new Map();
    private lastSentAt:   Map<string, number>  = new Map();
    private isProcessing: Map<string, boolean> = new Map();

    // Token bucket — global safety throttle (lower than CRM: posting is less urgent)
    private tokens:      Map<string, number> = new Map();
    private lastRefillAt:Map<string, number> = new Map();

    // Daily plan: sorted list of remaining future epoch-ms slots for today
    private dailySlots: Map<string, number[]> = new Map();
    // Which calendar day the plan was made ("YYYY-M-D" string from todayKey())
    private planDay:    Map<string, string>   = new Map();
    // FIX M4: once all slots for a given day are exhausted, mark that day as done
    // so empty-slots does NOT trigger a rebuild for the same calendar day.
    private planDayExhausted: Map<string, string> = new Map();

    public readonly MAX_TOKENS = 20; // lower than CRM (20 posts/hr max across all groups)
    private readonly REFILL_INTERVAL_MS = 3 * 60 * 1000; // 1 token / 3 min → 20/hr
    private readonly CHECK_INTERVAL_MS  = 10_000;         // check every 10s
    private readonly MIN_DELAY_MS       = 30_000;         // min 30s between sends

    public static getInstance(): PostingSchedulerService {
        if (!PostingSchedulerService.instance) {
            PostingSchedulerService.instance = new PostingSchedulerService();
        }
        return PostingSchedulerService.instance;
    }

    /** Idempotent — safe to call multiple times for same account */
    public startForAccount(zaloId: string): void {
        if (this.timers.has(zaloId)) return;
        Logger.log(`[PostingScheduler] Starting for ${zaloId}`);
        if (!this.tokens.has(zaloId)) {
            this.tokens.set(zaloId, this.MAX_TOKENS);
            this.lastRefillAt.set(zaloId, Date.now());
        } else {
            this.refillTokens(zaloId);
        }
        const timer = setInterval(() => this.tick(zaloId), this.CHECK_INTERVAL_MS);
        this.timers.set(zaloId, timer);
    }

    /** Stop and clean up all per-account state */
    public stopForAccount(zaloId: string): void {
        const timer = this.timers.get(zaloId);
        if (timer) { clearInterval(timer); this.timers.delete(zaloId); }
        this.lastSentAt.delete(zaloId);
        this.isProcessing.delete(zaloId);
        this.tokens.delete(zaloId);
        this.lastRefillAt.delete(zaloId);
        this.dailySlots.delete(zaloId);
        this.planDay.delete(zaloId);
        this.planDayExhausted.delete(zaloId);
        Logger.log(`[PostingScheduler] Stopped for ${zaloId}`);
        EventBroadcaster.emit('postingBot:update', {
            zaloId, type: 'stopped', running: false,
        });
    }

    public getStatus(zaloId: string): { running: boolean; tokens: number; maxTokens: number; lastSentAt: number } {
        return {
            running:    this.timers.has(zaloId),
            tokens:     this.tokens.get(zaloId) ?? this.MAX_TOKENS,
            maxTokens:  this.MAX_TOKENS,
            lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
        };
    }

    /** Resume enabled schedules at app startup (mirrors resumeActiveCampaigns) */
    public resumeActiveSchedules(): void {
        try {
            const db = DatabaseService.getInstance();
            // Find all accounts that have an enabled schedule
            const rows = db.query<any>(`SELECT DISTINCT owner_zalo_id FROM post_schedule WHERE enabled=1`);
            for (const row of rows) {
                Logger.log(`[PostingScheduler] Resuming for ${row.owner_zalo_id}`);
                this.startForAccount(row.owner_zalo_id);
            }
        } catch (err: any) {
            Logger.warn(`[PostingScheduler] resumeActiveSchedules: ${err.message}`);
        }
    }

    // ─── Token bucket ─────────────────────────────────────────────────────────

    private refillTokens(zaloId: string): void {
        const now = Date.now();
        const lastRefill = this.lastRefillAt.get(zaloId) || now;
        const elapsed = now - lastRefill;
        const toAdd = Math.floor(elapsed / this.REFILL_INTERVAL_MS);
        if (toAdd > 0) {
            const current = this.tokens.get(zaloId) ?? 0;
            this.tokens.set(zaloId, Math.min(this.MAX_TOKENS, current + toAdd));
            this.lastRefillAt.set(zaloId, lastRefill + toAdd * this.REFILL_INTERVAL_MS);
        }
    }

    // ─── Daily plan ───────────────────────────────────────────────────────────

    private todayKey(): string {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    /**
     * Build daily plan only when the calendar day has changed (or plan was never built).
     * FIX M4: an exhausted plan for TODAY is treated as "done for today" — never rebuilt
     * until the calendar day actually changes.
     */
    private ensureDailyPlan(zaloId: string, schedule: { window_start: string; window_end: string; posts_per_day: number }): void {
        const today = this.todayKey();
        const storedDay = this.planDay.get(zaloId);
        const exhaustedDay = this.planDayExhausted.get(zaloId);

        // Plan is current and not yet exhausted — nothing to do
        if (storedDay === today && this.dailySlots.has(zaloId)) {
            // Even if slots is empty, do NOT rebuild if today is already exhausted
            if (exhaustedDay === today) return;
            // Slots still remaining — also nothing to do
            const slots = this.dailySlots.get(zaloId) ?? [];
            if (slots.length > 0) return;
            // slots is empty AND today is NOT exhausted: mark exhausted (slots all fired)
            this.planDayExhausted.set(zaloId, today);
            Logger.log(`[PostingScheduler] ${zaloId}: all slots exhausted for ${today}, done for today`);
            return;
        }

        // Either: first time, or calendar day has changed → build fresh plan
        if (storedDay !== today) {
            // New day: clear exhausted marker
            this.planDayExhausted.delete(zaloId);
        }

        const newSlots = planDailySlots(
            schedule.window_start,
            schedule.window_end,
            schedule.posts_per_day,
            Date.now(),
        );
        this.dailySlots.set(zaloId, newSlots);
        this.planDay.set(zaloId, today);
        Logger.log(`[PostingScheduler] ${zaloId}: new daily plan for ${today}: [${newSlots.map(s => new Date(s).toTimeString().slice(0,5)).join(', ')}]`);
    }

    // ─── Main tick ────────────────────────────────────────────────────────────

    private async tick(zaloId: string): Promise<void> {
        if (this.isProcessing.get(zaloId)) return;

        const db = DatabaseService.getInstance();
        const schedule = db.getPostSchedule(zaloId);
        if (!schedule || !schedule.enabled) return;

        this.ensureDailyPlan(zaloId, schedule);
        this.refillTokens(zaloId);

        // Peek at the next slot — do NOT pop yet (FIX M2+M5)
        const slots = this.dailySlots.get(zaloId) ?? [];
        const now = Date.now();
        if (slots.length === 0 || slots[0] > now) return;

        // FIX M2+M5: check token budget BEFORE consuming the slot
        const tokens = this.tokens.get(zaloId) ?? 0;
        if (tokens <= 0) {
            Logger.log(`[PostingScheduler] ${zaloId}: no tokens, deferring slot`);
            return; // slot stays — will retry next tick
        }

        // FIX M2+M5: check MIN_DELAY BEFORE consuming the slot
        const lastSent = this.lastSentAt.get(zaloId) ?? 0;
        if (now - lastSent < this.MIN_DELAY_MS) return; // slot stays

        // FIX M2+M5: check connection BEFORE consuming the slot
        const conn = ConnectionManager.getConnection(zaloId);
        if (!conn?.api) {
            Logger.warn(`[PostingScheduler] ${zaloId}: no connection, deferring slot`);
            return; // slot stays — will retry next tick when connection is available
        }

        // Get oldest approved draft BEFORE consuming slot
        const drafts = db.getContentDrafts(zaloId, 'approved');
        // getContentDrafts returns ORDER BY updated_at DESC — take oldest (last element)
        const draft = drafts.length > 0 ? drafts[drafts.length - 1] : null;
        if (!draft || !draft.id) return; // no draft available — slot stays (retry next tick)

        // Parse group IDs BEFORE consuming slot
        let groupIds: string[] = [];
        try { groupIds = JSON.parse(schedule.group_ids); } catch {}
        if (!Array.isArray(groupIds) || groupIds.length === 0) return;

        // All preconditions met — NOW consume the slot
        slots.shift();
        this.dailySlots.set(zaloId, slots);

        this.isProcessing.set(zaloId, true);
        try {
            const hardCap = Math.min(schedule.posts_per_day, 3);

            // Resolve image path once (if draft has image_asset_id)
            let absImagePath: string | null = null;
            if (draft.image_asset_id) {
                try {
                    const assets = db.getImageAssets(zaloId);
                    const asset = assets.find(a => a.id === draft.image_asset_id);
                    if (asset?.rel_path) {
                        absImagePath = FileStorageService.resolveAbsolutePath(asset.rel_path);
                    }
                } catch (imgErr: any) {
                    Logger.warn(`[PostingScheduler] ${zaloId}: image resolve error: ${imgErr.message}`);
                }
            }

            let sentCount = 0;

            for (let gi = 0; gi < groupIds.length; gi++) {
                const groupId = groupIds[gi];

                // FIX countPostsToday fail-closed: if the read fails, treat as cap reached
                let sentToday: number;
                try {
                    sentToday = db.countPostsToday(zaloId, groupId);
                } catch (capErr: any) {
                    Logger.error(`[PostingScheduler] ${zaloId} group ${groupId}: countPostsToday failed (${capErr.message}) — skipping to prevent uncapped send`);
                    continue; // fail closed
                }

                if (sentToday >= hardCap) {
                    Logger.log(`[PostingScheduler] ${zaloId} group ${groupId}: cap reached (${sentToday}/${hardCap}), skipping`);
                    continue;
                }

                // Space sends by MIN_DELAY + jitter (between groups in same batch)
                if (gi > 0) {
                    const jitter = Math.random() * 10_000; // up to 10s extra
                    await new Promise(r => setTimeout(r, this.MIN_DELAY_MS + jitter));
                }

                // FIX I2: sendToGroup returns boolean success
                const sent = await this.sendToGroup(zaloId, draft.id!, draft.text, groupId, absImagePath, conn.api);
                if (sent) sentCount++;
            }

            // FIX I2: only mark 'posted' if at least one group received the draft
            if (sentCount > 0) {
                db.updateDraftStatus(zaloId, draft.id!, 'posted');
            } else {
                Logger.warn(`[PostingScheduler] ${zaloId}: draft ${draft.id} — no group received it, leaving as 'approved' for retry`);
            }

            // Consume token (slot was attempted regardless of individual group outcomes)
            this.tokens.set(zaloId, Math.max(0, (this.tokens.get(zaloId) ?? 1) - 1));
            this.lastSentAt.set(zaloId, Date.now());

            EventBroadcaster.emit('postingBot:update', {
                zaloId,
                type: 'slot_done',
                draftId: draft.id,
                sentCount,
                tokens: this.tokens.get(zaloId) ?? 0,
                maxTokens: this.MAX_TOKENS,
                lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
            });

        } catch (err: any) {
            Logger.error(`[PostingScheduler] ${zaloId}: tick error: ${err.message}`);
        } finally {
            this.isProcessing.set(zaloId, false);
        }
    }

    /**
     * Send text (+ optional image) to one group and log the result.
     * FIX I2: returns true if text was sent successfully, false on error.
     * Image send failure is non-fatal (logged as warning, text still counts as sent).
     */
    private async sendToGroup(
        zaloId: string,
        draftId: number,
        text: string,
        groupId: string,
        absImagePath: string | null,
        api: any,
    ): Promise<boolean> {
        const db = DatabaseService.getInstance();
        try {
            // Send text
            await api.sendMessage({ msg: text }, groupId, ThreadType.Group);

            // Send image if available (mirrors CRMQueueService attachment pattern)
            if (absImagePath) {
                try {
                    const buffer = fs.readFileSync(absImagePath);
                    const baseName = path.basename(absImagePath);
                    const ext = path.extname(baseName) || '.jpg';
                    const safeFilename = (path.extname(baseName) ? baseName : `${baseName}${ext}`) as `${string}.${string}`;
                    let width = 0, height = 0;
                    try { const dim = imageSize(buffer); width = dim.width ?? 0; height = dim.height ?? 0; } catch {}
                    await api.sendMessage(
                        { msg: '', attachments: [{ data: buffer, filename: safeFilename, metadata: { totalSize: buffer.length, width, height } }] },
                        groupId,
                        ThreadType.Group,
                    );
                } catch (imgErr: any) {
                    Logger.warn(`[PostingScheduler] ${zaloId} group ${groupId}: image send failed: ${imgErr.message}`);
                }
            }

            db.addPostLog({ owner_zalo_id: zaloId, draft_id: draftId, group_id: groupId, status: 'sent', posted_at: Date.now() });
            Logger.log(`[PostingScheduler] ${zaloId} group ${groupId}: sent draft ${draftId}`);
            return true;

        } catch (err: any) {
            const errMsg = err?.message || String(err);
            Logger.error(`[PostingScheduler] ${zaloId} group ${groupId}: send failed: ${errMsg}`);
            db.addPostLog({ owner_zalo_id: zaloId, draft_id: draftId, group_id: groupId, status: 'failed', error: errMsg, posted_at: Date.now() });
            return false;
        }
    }
}

export default PostingSchedulerService;
