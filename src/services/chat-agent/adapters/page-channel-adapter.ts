/**
 * page-channel-adapter.ts — turn a parsed Page webhook message into the
 * channel-neutral ChannelEvent and hand it to the Chat Agent dispatcher.
 *
 * Emits on `event:channelMessage` via EventBroadcaster.fireHooksOnly (same bridge
 * the Zalo adapter uses) — NOT `event:message`, so Page traffic never enters the
 * legacy RELAY_CHANNELS / workflow-engine path (red-team C5).
 *
 * The dispatcher IS running in production (electron/main.ts starts it), so this
 * hook DOES fire for every inbound Page message. It stays a safe no-reply in
 * Phase 3 because the dispatcher has NO `'page'` ChannelContextProvider registered
 * yet (registerChannels registers only `'zalo'`), so onEvent hits
 * `channelProviderRegistry.pick('page') → undefined → return` before any reply or
 * LLM call. Phase 4 registers the Page provider + sender to turn replies on; that
 * activation is intentionally out of scope here.
 */

import EventBroadcaster from '../../event/EventBroadcaster';
import type { ChannelEvent } from '../channel-event';
import type { ParsedMessagingEvent } from '../../facebook-page/page-webhook-parse';
import { extractImageUrls } from '../../ai/vision-support';

/** Build the ChannelEvent for an inbound customer message. */
export function toChannelEvent(ev: ParsedMessagingEvent): ChannelEvent {
    // Surface image URLs so a caption-less photo still triggers a reply (the vision
    // model reads them from persisted history). extractImageUrls filters to images.
    const images = extractImageUrls(JSON.stringify(ev.attachments || []));
    return {
        channel: 'page',
        accountId: ev.pageId,
        threadId: ev.psid,
        threadType: 'user',           // Messenger Page conversations are 1:1
        senderId: ev.psid,
        text: ev.text,
        msgId: ev.mid,
        ts: ev.ts,
        isSelf: false,
        ...(images.length ? { images } : {}),
    };
}

/** Fire the inbound customer message at the dispatcher (if it's listening). */
export function emitPageChannelEvent(ev: ParsedMessagingEvent): void {
    EventBroadcaster.fireHooksOnly('event:channelMessage', toChannelEvent(ev));
}
