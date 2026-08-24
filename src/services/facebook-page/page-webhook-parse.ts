/**
 * page-webhook-parse.ts — PURE parsing of Messenger webhook bodies (no I/O, no
 * electron/DB imports) so it is unit-testable in a plain Node environment.
 */

/** One normalised messaging event pulled out of a webhook entry. */
export interface ParsedMessagingEvent {
    kind: 'message' | 'echo' | 'read' | 'delivery' | 'other';
    pageId: string;
    /** The customer PSID (the non-Page party), for both inbound and echo. */
    psid: string;
    /** Author of the event (customer for inbound, page for echo). */
    senderId: string;
    mid?: string;
    text: string;
    attachments: Array<{ type: string; url?: string }>;
    ts: number;
    /** For echoes: the app that sent it (lets us spot our own sends later). */
    appId?: string;
}

/** Pure: turn a webhook body into normalised events. Never throws on odd shapes. */
export function parseWebhookBody(body: any): ParsedMessagingEvent[] {
    const out: ParsedMessagingEvent[] = [];
    const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
        const pageId = String(entry?.id ?? '');
        const events: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
        for (const m of events) {
            const ts = Number(m?.timestamp) || Date.now();
            if (m?.message) {
                const msg = m.message;
                const text = typeof msg.text === 'string' ? msg.text : '';
                const attachments = Array.isArray(msg.attachments)
                    ? msg.attachments.map((a: any) => ({ type: String(a?.type ?? 'unknown'), url: a?.payload?.url ? String(a.payload.url) : undefined }))
                    : [];
                if (msg.is_echo) {
                    out.push({
                        kind: 'echo', pageId,
                        psid: String(m?.recipient?.id ?? ''),
                        senderId: String(m?.sender?.id ?? pageId),
                        mid: msg.mid ? String(msg.mid) : undefined,
                        text, attachments, ts,
                        appId: msg.app_id != null ? String(msg.app_id) : undefined,
                    });
                } else {
                    out.push({
                        kind: 'message', pageId,
                        psid: String(m?.sender?.id ?? ''),
                        senderId: String(m?.sender?.id ?? ''),
                        mid: msg.mid ? String(msg.mid) : undefined,
                        text, attachments, ts,
                    });
                }
            } else if (m?.read) {
                out.push({ kind: 'read', pageId, psid: String(m?.sender?.id ?? ''), senderId: String(m?.sender?.id ?? ''), text: '', attachments: [], ts });
            } else if (m?.delivery) {
                out.push({ kind: 'delivery', pageId, psid: String(m?.sender?.id ?? ''), senderId: String(m?.sender?.id ?? ''), text: '', attachments: [], ts });
            } else {
                out.push({ kind: 'other', pageId, psid: '', senderId: '', text: '', attachments: [], ts });
            }
        }
    }
    return out;
}
