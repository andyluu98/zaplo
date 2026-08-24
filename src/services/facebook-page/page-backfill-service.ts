/**
 * page-backfill-service.ts — pull messages that arrived while the app was offline.
 *
 * On startup (and on demand) fetch recent Messenger conversations for each enabled
 * Page and PERSIST them WITHOUT emitting — so reopening the app never fires a burst
 * of auto-replies to old messages (red-team M4). Actual replay of the newest missed
 * message is deferred to Phase 4 (needs the Send path); here we only fill history.
 *
 * Uses the messages UNIQUE(msg_id, owner_zalo_id) dedupe, so overlapping fetches
 * are idempotent. Cursor `fb_page.last_backfill_at` records the last run.
 */

import Logger from '../../utils/Logger';
import DatabaseService from '../database/DatabaseService';
import { decryptSecret } from '../secure/SecureSettingsService';
import { pageGraphClient, MetaGraphError } from './page-graph-client';

const CHANNEL = 'page';

/** Persist one backfilled message (no emit). Returns true if newly inserted. */
function persistBackfillMessage(pageId: string, psid: string, m: { mid: string; text: string; fromPage: boolean; ts: number }): boolean {
    if (!m.mid) return false;
    const db = DatabaseService.getInstance();
    try {
        const changes = db.runWithChanges(
            `INSERT OR IGNORE INTO messages
               (msg_id, owner_zalo_id, thread_id, thread_type, sender_id, content, msg_type, timestamp, is_sent, attachments, channel, status, sent_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [m.mid, pageId, psid, 0, m.fromPage ? pageId : psid, m.text, 'text', m.ts, m.fromPage ? 1 : 0, '[]', CHANNEL, m.fromPage ? 'sent' : 'received', m.fromPage ? 'human' : null],
        );
        return changes > 0;
    } catch (e: any) {
        Logger.warn(`[PageBackfill] persist: ${e.message}`);
        return false;
    }
}

/** Backfill one Page. Returns count of newly stored messages. */
export async function backfillPage(pageId: string): Promise<number> {
    const db = DatabaseService.getInstance();
    const page = db.getFbPage(pageId);
    if (!page || !page.enabled) return 0;
    const token = decryptSecret(page.access_token_enc);
    if (!token) {
        Logger.warn(`[PageBackfill] ${pageId}: token not decryptable — skipping`);
        return 0;
    }
    let stored = 0;
    try {
        const convs = await pageGraphClient.getRecentConversations({ pageId, pageToken: token });
        for (const conv of convs) {
            for (const m of conv.messages) {
                if (persistBackfillMessage(pageId, conv.psid, m)) stored++;
            }
            // Refresh the thread's last-message preview without bumping unread.
            const last = conv.messages[conv.messages.length - 1];
            if (last) {
                try {
                    db.run(
                        `INSERT INTO contacts (owner_zalo_id, contact_id, display_name, channel, contact_type, last_message, last_message_time)
                         VALUES (?,?,?,?,?,?,?)
                         ON CONFLICT(owner_zalo_id, contact_id) DO UPDATE SET
                           last_message = CASE WHEN excluded.last_message_time >= contacts.last_message_time THEN excluded.last_message ELSE contacts.last_message END,
                           last_message_time = MAX(excluded.last_message_time, contacts.last_message_time)`,
                        [pageId, conv.psid, '', CHANNEL, 'user', last.text.slice(0, 500), last.ts],
                    );
                } catch { /* noop */ }
            }
        }
        db.run(`UPDATE fb_page SET last_backfill_at=? WHERE page_id=?`, [Date.now(), pageId]);
    } catch (err: any) {
        if (err instanceof MetaGraphError && err.kind === 'token') {
            db.setFbPageTokenStatus(pageId, 'expired');
        }
        Logger.warn(`[PageBackfill] ${pageId}: ${err?.message || err}`);
    }
    if (stored > 0) Logger.log(`[PageBackfill] ${pageId}: stored ${stored} missed message(s)`);
    return stored;
}

/** Backfill every enabled Page (startup). Serialized to cap Graph concurrency. */
export async function backfillAllPages(): Promise<void> {
    const pages = DatabaseService.getInstance().listFbPages().filter((p) => p.enabled && p.token_status === 'active');
    for (const p of pages) {
        await backfillPage(p.page_id);
    }
}
