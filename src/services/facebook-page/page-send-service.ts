/**
 * page-send-service.ts — the Facebook Page implementation of ChannelSender.
 *
 * Takes the SAME parsed segment array the dispatcher already builds for Zalo
 * (text + image — red-team H7) and delivers it to Messenger via the Send API with
 * human-like pacing: mark_seen, then per text segment typing_on → length-based
 * delay → typing_off → send. Images go as attachment-by-URL segments.
 *
 * Guards:
 *  - 24h standard-messaging window (canSendNow) — outside it we do NOT call the API
 *    and leave the thread for a human (returns ok:false, sentCount:0).
 *  - bot disclosure: when the Page has it on (default) and the AI has not replied in
 *    this thread yet, a one-line "auto-reply" disclosure is prepended.
 *  - Meta errors: token → disable the Page + mark token expired; rate-limit → one
 *    backed-off retry then stop; permission → stop. Never logs token/secret.
 *
 * Every delivered message is recorded (channel='page', is_sent=1, sent_by='ai') with
 * its Meta message_id so the webhook echo of our own send is recognised (dedupe) and
 * never mistaken for a human handoff.
 */

import Logger from '../../utils/Logger';
import DatabaseService from '../database/DatabaseService';
import { decryptSecret } from '../secure/SecureSettingsService';
import { pageGraphClient, MetaGraphError } from './page-graph-client';
import { canSendNow } from './messaging-window';
import { typingDelayMs, INTER_SEGMENT_DELAY_MS, INTER_IMAGE_DELAY_MS } from './typing-delay';
import type { ChannelSender, SendSegmentsInput, SendResult, AIStructuredSegment } from '../chat-agent/channel-event';
import type { FbPage } from '../../models';

/** One-line disclosure prepended to the first auto-reply of a thread (Page opt-out). */
export const DISCLOSURE_TEXT = 'Bạn đang được hỗ trợ bởi trợ lý tự động của shop. Cần gặp nhân viên, bạn cứ nhắn nhé!';

const RATE_LIMIT_BACKOFF_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PageSendService implements ChannelSender {
    isReady(accountId: string): boolean {
        const page = DatabaseService.getInstance().getFbPage(accountId);
        return !!page && !!page.enabled && page.token_status === 'active';
    }

    async setTyping(p: { accountId: string; threadId: string; on: boolean }): Promise<void> {
        const ctx = this.resolve(p.accountId);
        if (!ctx) return;
        await pageGraphClient.sendSenderAction({
            pageId: p.accountId, pageToken: ctx.token, psid: p.threadId,
            action: p.on ? 'typing_on' : 'typing_off',
        });
    }

    async markSeen(p: { accountId: string; threadId: string }): Promise<void> {
        const ctx = this.resolve(p.accountId);
        if (!ctx) return;
        await pageGraphClient.sendSenderAction({ pageId: p.accountId, pageToken: ctx.token, psid: p.threadId, action: 'mark_seen' });
    }

    /**
     * Resolve the Page's decrypted token + row, gated by the 24h window so ANY
     * sender_action (typing/seen) — not just send() — stays inside it. Returns null
     * when the Page is missing/disabled, outside 24h, or its token can't be decrypted.
     */
    private resolve(pageId: string): { token: string } | null {
        const page = DatabaseService.getInstance().getFbPage(pageId);
        if (!page || !page.enabled) return null;
        if (!canSendNow(page.last_customer_message_at)) return null;
        const token = decryptSecret(page.access_token_enc);
        if (!token) {
            Logger.warn(`[PageSend] ${pageId}: token not decryptable — skipping`);
            return null;
        }
        return { token };
    }

    async send(p: SendSegmentsInput): Promise<SendResult> {
        const db = DatabaseService.getInstance();
        const pageId = p.accountId;
        const psid = p.threadId;
        const fail: SendResult = { ok: false, sentCount: 0, sentTexts: [] };

        const page = db.getFbPage(pageId);
        if (!page || !page.enabled) return fail;
        if (page.token_status !== 'active') return fail;

        // 24h standard-messaging window: outside it, do NOT call the API.
        if (!canSendNow(page.last_customer_message_at)) {
            Logger.log(`[PageSend] ${pageId}/${psid}: outside 24h window — leaving for human`);
            return fail;
        }

        const token = decryptSecret(page.access_token_enc);
        if (!token) {
            Logger.warn(`[PageSend] ${pageId}: token not decryptable — skipping`);
            return fail;
        }

        // Prepend the auto-reply disclosure on the very first AI reply of this thread.
        const segments = this.withDisclosure(p.segments, page, psid);

        const sentTexts: string[] = [];
        const messageIds: string[] = [];

        try {
            await pageGraphClient.sendSenderAction({ pageId, pageToken: token, psid, action: 'mark_seen' });

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (seg.type === 'text') {
                    const text = String(seg.content ?? '').trim();
                    if (!text) continue;
                    if (i > 0) await sleep(INTER_SEGMENT_DELAY_MS);
                    await pageGraphClient.sendSenderAction({ pageId, pageToken: token, psid, action: 'typing_on' });
                    await sleep(typingDelayMs(text, true));
                    await pageGraphClient.sendSenderAction({ pageId, pageToken: token, psid, action: 'typing_off' });
                    const mid = await this.sendWithRetry(() => pageGraphClient.sendText({ pageId, pageToken: token, psid, text }));
                    db.recordPageSentMessage(pageId, psid, mid, text);
                    sentTexts.push(text);
                    if (mid) messageIds.push(mid);
                } else if (seg.type === 'image') {
                    const urls = Array.isArray(seg.content) ? seg.content : [seg.content];
                    for (let j = 0; j < urls.length; j++) {
                        const url = urls[j];
                        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
                        if (i > 0 || j > 0) await sleep(INTER_IMAGE_DELAY_MS);
                        const mid = await this.sendWithRetry(() => pageGraphClient.sendImage({ pageId, pageToken: token, psid, url }));
                        db.recordPageSentMessage(pageId, psid, mid, url, JSON.stringify([{ type: 'image', url }]));
                        sentTexts.push(url);
                        if (mid) messageIds.push(mid);
                    }
                }
            }
        } catch (err) {
            this.handleSendError(err, pageId);
            // Return what we managed to send before the error (partial reply is fine).
            return { ok: sentTexts.length > 0, sentCount: sentTexts.length, sentTexts, messageIds };
        }

        return { ok: sentTexts.length > 0, sentCount: sentTexts.length, sentTexts, messageIds };
    }

    /** Prepend the disclosure text as a first text segment when required. */
    private withDisclosure(segments: AIStructuredSegment[], page: FbPage, psid: string): AIStructuredSegment[] {
        const wantDisclosure = page.bot_disclosure == null ? true : page.bot_disclosure !== 0;
        if (!wantDisclosure) return segments;
        if (DatabaseService.getInstance().hasPageAiReplied(page.page_id, psid)) return segments;
        return [{ type: 'text', content: DISCLOSURE_TEXT }, ...segments];
    }

    /** Send once; on a Meta rate-limit, back off and retry a single time. */
    private async sendWithRetry(fn: () => Promise<string>): Promise<string> {
        try {
            return await fn();
        } catch (err) {
            if (err instanceof MetaGraphError && err.kind === 'rate_limit') {
                Logger.warn('[PageSend] rate-limited — backing off once');
                await sleep(RATE_LIMIT_BACKOFF_MS);
                return await fn();
            }
            throw err;
        }
    }

    /** Map a fatal Meta error to a Page state change (token/permission → stop). */
    private handleSendError(err: unknown, pageId: string): void {
        const db = DatabaseService.getInstance();
        if (err instanceof MetaGraphError) {
            if (err.kind === 'token') {
                db.setFbPageTokenStatus(pageId, 'expired');
                db.setFbPageEnabled(pageId, 0);
                Logger.error(`[PageSend] ${pageId}: token invalid (code=${err.code}) — Page disabled`);
                return;
            }
            if (err.kind === 'permission') {
                db.setFbPageEnabled(pageId, 0);
                Logger.error(`[PageSend] ${pageId}: missing permission (code=${err.code}) — Page disabled`);
                return;
            }
            Logger.warn(`[PageSend] ${pageId}: send failed (kind=${err.kind}, code=${err.code})`);
            return;
        }
        Logger.warn(`[PageSend] ${pageId}: send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Process-wide singleton — stateless, safe to share. */
export const pageSendService = new PageSendService();
