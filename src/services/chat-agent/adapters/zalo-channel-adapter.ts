/**
 * zalo-channel-adapter — bridges the legacy Zalo `event:message` stream onto the
 * channel-neutral `event:channelMessage` the dispatcher now consumes.
 *
 * WHY a separate channel: `event:message` is in HttpRelayService.RELAY_CHANNELS
 * and drives the workflow engine. Emitting multi-channel payloads there would
 * fan Page traffic into the relay + workflow engine (red-team C5). The dispatcher
 * therefore listens ONLY on `event:channelMessage`; this adapter (Zalo) and the
 * Page webhook (Phase 3) are the two producers.
 *
 * The pure `zaloPayloadToChannelEvent` is exported for unit testing; the class
 * owns the EventBroadcaster subscription lifecycle (start / rehook / stop).
 */

import EventBroadcaster from '../../event/EventBroadcaster';
import Logger from '../../../utils/Logger';
import type { ChannelEvent } from '../channel-event';

/** Structural view of the internally-produced Zalo event payload (fields we read). */
interface RawZaloMessage {
  data?: {
    uidFrom?: unknown;
    msgId?: unknown;
    ts?: unknown;
    content?: unknown;
    msgType?: unknown;
    mentions?: unknown;
    idTo?: unknown;
  };
  threadId?: unknown;
  type?: unknown;
  isSelf?: unknown;
  isGroup?: unknown;
  uidFrom?: unknown;
  content?: unknown;
  msgType?: unknown;
  mentions?: unknown;
  ts?: unknown;
}
interface RawZaloPayload {
  zaloId?: unknown;
  isSelf?: unknown;
  message?: RawZaloMessage;
  data?: RawZaloMessage;
}

/** Read a string-valued field from an unknown object, else undefined. */
function strField(o: unknown, key: string): string | undefined {
  if (o && typeof o === 'object' && key in o) {
    const v = (o as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Human-readable text of a Zalo message, mirroring the workflow engine's rules. */
function extractText(rawContent: unknown, msgType: string): string {
  if (typeof rawContent === 'string') return rawContent;
  const msg = strField(rawContent, 'msg');
  if (msg) return msg;
  if (rawContent && typeof rawContent === 'object') {
    if (msgType === 'chat.recommended' || msgType === 'chat.link') {
      return strField(rawContent, 'title') || strField(rawContent, 'href') || '';
    }
    return strField(rawContent, 'title') || '';
  }
  return '';
}

function coerceMentions(raw: unknown): ChannelEvent['mentions'] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ChannelEvent['mentions']> = [];
  for (const m of raw) {
    const uid = strField(m, 'uid');
    if (uid == null) continue;
    const pos = m && typeof m === 'object' && 'pos' in m ? Number((m as Record<string, unknown>).pos) : undefined;
    const len = m && typeof m === 'object' && 'len' in m ? Number((m as Record<string, unknown>).len) : undefined;
    out.push({ uid, pos: Number.isFinite(pos) ? pos : undefined, len: Number.isFinite(len) ? len : undefined });
  }
  return out.length ? out : undefined;
}

/**
 * Convert a raw Zalo `event:message` payload to a ChannelEvent, or null when it
 * carries no usable account/thread. Pure — no side effects, unit-testable.
 */
export function zaloPayloadToChannelEvent(data: unknown): ChannelEvent | null {
  // The payload is produced in-process by WorkflowEngineService.flattenTriggerData;
  // its zca-js union is unexpressible here, so treat it as the structural view above.
  const payload = (data ?? {}) as RawZaloPayload;
  const zaloId = strField(payload, 'zaloId') || '';
  const msg: RawZaloMessage = payload.message || payload.data || {};
  const msgData = msg.data || {};
  const threadId = strField(msg, 'threadId') || strField(msgData, 'idTo') || '';
  if (!zaloId || !threadId) return null;

  const isSelf = msg.isSelf === true || payload.isSelf === true;
  const isGroup = msg.type === 1 || msg.isGroup === true;
  const mentions = coerceMentions(msgData.mentions ?? msg.mentions);
  const senderId = strField(msgData, 'uidFrom') || strField(msg, 'uidFrom') || '';
  const msgType = strField(msgData, 'msgType') || strField(msg, 'msgType') || '';
  const text = extractText(msgData.content ?? msg.content, msgType);
  const tsNum = Number(msgData.ts ?? msg.ts);

  return {
    channel: 'zalo',
    accountId: zaloId,
    threadId,
    threadType: isGroup ? 'group' : 'user',
    senderId,
    text,
    mentions,
    msgId: strField(msgData, 'msgId') || '',
    ts: Number.isFinite(tsNum) ? tsNum : Date.now(),
    isSelf,
  };
}

class ZaloChannelAdapter {
  private static instance: ZaloChannelAdapter;
  private unsubscribe: (() => void) | null = null;

  static getInstance(): ZaloChannelAdapter {
    if (!ZaloChannelAdapter.instance) ZaloChannelAdapter.instance = new ZaloChannelAdapter();
    return ZaloChannelAdapter.instance;
  }

  private bind(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = EventBroadcaster.onBeforeSend('event:message', (data: unknown) => {
      try {
        const evt = zaloPayloadToChannelEvent(data);
        // fireHooksOnly: reach the dispatcher's hook WITHOUT re-sending to the
        // renderer (which already received the original event:message).
        if (evt) EventBroadcaster.fireHooksOnly('event:channelMessage', evt);
      } catch (e) {
        Logger.warn(`[ZaloChannelAdapter] bridge error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  start(): void {
    this.bind();
  }

  /** Re-attach after EventBroadcaster.clearBeforeSendHooks() (workspace switch). */
  rehook(): void {
    this.bind();
  }

  stop(): void {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
  }
}

export default ZaloChannelAdapter;
