/**
 * page-webhook-handler.ts — parse + route Messenger webhook traffic.
 *
 * GET  /webhook/messenger  → hub.challenge when hub.verify_token matches an
 *                            enabled app's stored verify token.
 * POST /webhook/messenger  → verify X-Hub-Signature-256 against the owning app's
 *                            secret (resolved from entry[].id → fb_page → fb_app),
 *                            then persist + emit ASYNCHRONOUSLY after replying 200.
 *
 * SECURITY: signature is verified on the RAW body before anything is read/written.
 * Unknown/disabled Page or bad signature ⇒ 403, no DB write. Never logs message
 * text at info level.
 */

import * as crypto from 'crypto';
import Logger from '../../utils/Logger';
import DatabaseService from '../database/DatabaseService';
import { decryptSecret } from '../secure/SecureSettingsService';
import { verifySignature } from './page-webhook-verify';
import { parseWebhookBody, type ParsedMessagingEvent } from './page-webhook-parse';
import { storeInboundMessage, storeEcho, markReadReceipt } from './page-inbound-store';
import { emitPageChannelEvent } from '../chat-agent/adapters/page-channel-adapter';

export type { ParsedMessagingEvent } from './page-webhook-parse';

/** Constant-time string compare (avoids leaking the verify token via timing). */
function safeStrEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

/**
 * GET verify: return the challenge iff hub.verify_token matches ANY enabled
 * app's stored verify token. Returns null (→ caller sends 403) otherwise.
 */
export function handleVerify(query: Record<string, string | undefined>): string | null {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode !== 'subscribe' || !token || !challenge) return null;
    for (const app of DatabaseService.getInstance().listFbApps()) {
        const stored = decryptSecret(app.verify_token_enc);
        if (stored && safeStrEqual(stored, token)) return challenge;
    }
    return null;
}

/** Resolve the app secret that should have signed this delivery, from entry[].id. */
function resolveAppSecret(body: any): { pageId: string; secret: string } | null {
    const firstId = String(body?.entry?.[0]?.id ?? '');
    if (!firstId) return null;
    const page = DatabaseService.getInstance().getFbPage(firstId);
    if (!page || !page.enabled) return null;
    const app = DatabaseService.getInstance().getFbApp(page.app_id);
    if (!app) return null;
    const secret = decryptSecret(app.app_secret_enc);
    if (!secret) return null;
    return { pageId: firstId, secret };
}

/**
 * POST handler. Verifies signature synchronously (fast), returns the HTTP status,
 * and schedules persistence/emit asynchronously so we reply 200 within Meta's
 * timeout. Returns 403 on unknown Page or bad signature — with NO DB write.
 */
export function handleWebhookPost(rawBody: Buffer, signatureHeader: string | undefined): { status: number } {
    let body: any;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { return { status: 400 }; }
    if (body?.object !== 'page') return { status: 404 };

    const resolved = resolveAppSecret(body);
    if (!resolved) return { status: 403 }; // unknown/disabled Page → reject, no write

    if (!verifySignature(rawBody, signatureHeader, resolved.secret)) return { status: 403 };

    const events = parseWebhookBody(body);
    // Reply 200 immediately; process off the request path (Meta retries on slow/timeout).
    setImmediate(() => {
        for (const ev of events) {
            try { processEvent(ev); } catch (e: any) { Logger.warn(`[PageWebhook] process ${ev.kind}: ${e?.message || e}`); }
        }
    });
    return { status: 200 };
}

/** Persist + emit one parsed event. */
function processEvent(ev: ParsedMessagingEvent): void {
    if (!ev.pageId) return;
    // Per-entry guard (req #4): a single delivery may batch multiple entries that
    // share the app secret; only entry[0] was checked at verify time. Drop events
    // for a Page that isn't connected+enabled — no DB write, no emit.
    const page = DatabaseService.getInstance().getFbPage(ev.pageId);
    if (!page || !page.enabled) return;
    switch (ev.kind) {
        case 'message': {
            if (!ev.psid) return;
            const isNew = storeInboundMessage(ev);
            if (isNew) emitPageChannelEvent(ev);       // only emit genuinely new messages (dedupe)
            break;
        }
        case 'echo': {
            // A message the Page sent. If it was NOT our AI (Phase 4 records AI mids),
            // it's a human agent reply → auto-pause the thread. storeEcho handles both.
            storeEcho(ev);
            break;
        }
        case 'read':
            markReadReceipt(ev);
            break;
        // delivery / other: no action needed for auto-reply.
    }
}
