/**
 * page-inbound-store.ts — persist Page webhook events into the unified tables
 * (channel='page'), with dedupe. No network I/O; every write is synchronous and
 * happens before any emit so a Meta retry can never double-process.
 *
 * Dedupe uses the messages UNIQUE(msg_id, owner_zalo_id) via runWithChanges:
 * a fresh row ⇒ changes===1, a duplicate ⇒ 0. That same signal distinguishes a
 * human agent reply (new echo row) from our own AI send (Phase 4 already wrote
 * that mid as sent_by='ai', so the echo INSERT is ignored).
 */

import DatabaseService from '../database/DatabaseService';
import Logger from '../../utils/Logger';
import type { ParsedMessagingEvent } from './page-webhook-parse';

const CHANNEL = 'page';

function msgType(ev: ParsedMessagingEvent): string {
    if (ev.attachments.length > 0) return ev.attachments[0].type || 'attachment';
    return 'text';
}

/** Serialize content: keep attachment payloads alongside text so history reads them. */
function contentOf(ev: ParsedMessagingEvent): string {
    if (ev.attachments.length > 0) {
        return JSON.stringify({ msg: ev.text, attachments: ev.attachments });
    }
    return ev.text;
}

function upsertContact(pageId: string, psid: string, lastText: string, ts: number, bumpUnread: boolean): void {
    const db = DatabaseService.getInstance();
    try {
        db.run(
            `INSERT INTO contacts (owner_zalo_id, contact_id, display_name, channel, contact_type, unread_count, last_message, last_message_time)
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT(owner_zalo_id, contact_id) DO UPDATE SET
               last_message=excluded.last_message,
               last_message_time=excluded.last_message_time,
               unread_count=contacts.unread_count + ${bumpUnread ? 1 : 0}`,
            [pageId, psid, '', CHANNEL, 'user', bumpUnread ? 1 : 0, lastText.slice(0, 500), ts],
        );
    } catch (e: any) {
        Logger.warn(`[PageInboundStore] upsertContact: ${e.message}`);
    }
}

/**
 * Persist an inbound customer message. Returns true iff it was NEW (so the caller
 * emits exactly once; a Meta retry returns false).
 */
export function storeInboundMessage(ev: ParsedMessagingEvent): boolean {
    const db = DatabaseService.getInstance();
    const mid = ev.mid || `page_${ev.pageId}_${ev.psid}_${ev.ts}`;
    let changes = 0;
    try {
        changes = db.runWithChanges(
            `INSERT OR IGNORE INTO messages
               (msg_id, owner_zalo_id, thread_id, thread_type, sender_id, content, msg_type, timestamp, is_sent, attachments, channel, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [mid, ev.pageId, ev.psid, 0, ev.psid, contentOf(ev), msgType(ev), ev.ts, 0, JSON.stringify(ev.attachments), CHANNEL, 'received'],
        );
    } catch (e: any) {
        Logger.warn(`[PageInboundStore] storeInboundMessage: ${e.message}`);
        return false;
    }
    if (changes > 0) {
        upsertContact(ev.pageId, ev.psid, ev.text, ev.ts, true);
        try { db.run(`UPDATE fb_page SET last_customer_message_at=? WHERE page_id=?`, [ev.ts, ev.pageId]); } catch { /* noop */ }
    }
    return changes > 0;
}

/**
 * Persist a `message_echoes` event (something the Page sent). If the mid is
 * already stored as our AI send (sent_by='ai', written by Phase 4), the INSERT is
 * ignored and we do nothing. If it's a genuinely NEW echo, it's a human agent
 * replying from the Page inbox → record it and auto-pause the thread when an
 * enabled Page agent wants human-handoff pausing.
 */
export function storeEcho(ev: ParsedMessagingEvent): void {
    const db = DatabaseService.getInstance();
    const mid = ev.mid || `page_echo_${ev.pageId}_${ev.psid}_${ev.ts}`;
    let changes = 0;
    try {
        changes = db.runWithChanges(
            `INSERT OR IGNORE INTO messages
               (msg_id, owner_zalo_id, thread_id, thread_type, sender_id, content, msg_type, timestamp, is_sent, attachments, channel, status, sent_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [mid, ev.pageId, ev.psid, 0, ev.pageId, contentOf(ev), msgType(ev), ev.ts, 1, JSON.stringify(ev.attachments), CHANNEL, 'sent', 'human'],
        );
    } catch (e: any) {
        Logger.warn(`[PageInboundStore] storeEcho: ${e.message}`);
        return;
    }
    if (changes === 0) return; // already stored (our AI send) → not a human handoff

    upsertContact(ev.pageId, ev.psid, ev.text, ev.ts, false);

    // Independent self-send guard (does not rely on Send-API message_id == echo mid):
    // if the echo was sent BY OUR OWN app, it is the agent's own message (or a resend
    // we didn't pre-record) — never a human handoff, so do not auto-pause.
    if (ev.appId) {
        try {
            const ownAppId = db.getFbPage(ev.pageId)?.app_id;
            if (ownAppId && String(ownAppId) === String(ev.appId)) return;
        } catch { /* fall through to the human-handoff path */ }
    }

    // Human agent replied by hand → pause AI on this thread if an enabled Page
    // agent opts into autopause_on_human (interim until Phase 4 routes echoes
    // through the dispatcher's handleSelfMessage).
    try {
        const wantsPause = db.listEnabledChatAgents(ev.pageId, CHANNEL).some((a) => (a as any).autopause_on_human !== 0);
        if (wantsPause) {
            db.setConversationAiState(ev.pageId, ev.psid, { paused: 1, paused_reason: 'human', paused_at: Date.now() }, CHANNEL);
        }
    } catch (e: any) {
        Logger.warn(`[PageInboundStore] echo autopause: ${e.message}`);
    }
}

/** A read receipt clears the thread's unread counter. */
export function markReadReceipt(ev: ParsedMessagingEvent): void {
    if (!ev.psid) return;
    try {
        DatabaseService.getInstance().run(
            `UPDATE contacts SET unread_count=0 WHERE owner_zalo_id=? AND contact_id=? AND channel='page'`,
            [ev.pageId, ev.psid],
        );
    } catch (e: any) {
        Logger.warn(`[PageInboundStore] markReadReceipt: ${e.message}`);
    }
}
