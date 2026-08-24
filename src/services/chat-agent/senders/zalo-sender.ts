/**
 * ZaloSender — the Zalo implementation of ChannelSender.
 *
 * Wraps the exact `api.sendMessage` sequence the dispatcher used to run inline
 * (text segment → sendMessage; image segment → send each URL as text, spaced
 * 600ms), so outbound behaviour is unchanged. It returns the delivered text of
 * each segment so the dispatcher can record it for AI-echo suppression (that
 * bookkeeping stays in the dispatcher, which owns the echo map).
 */

import { ThreadType } from 'zca-js';
import ConnectionManager from '../../../utils/ConnectionManager';
import Logger from '../../../utils/Logger';
import { delay } from '../../../utils/delay';
import { ChannelSender, SendResult, SendSegmentsInput } from '../channel-event';

const SEGMENT_GAP_MS = 600;

export class ZaloSender implements ChannelSender {
  isReady(accountId: string): boolean {
    return !!ConnectionManager.getConnection(accountId)?.api;
  }

  async send({ accountId, threadId, threadType, segments }: SendSegmentsInput): Promise<SendResult> {
    const conn = ConnectionManager.getConnection(accountId);
    if (!conn?.api) {
      Logger.warn(`[ZaloSender] ${accountId}: not connected — skip send`);
      return { ok: false, sentCount: 0, sentTexts: [] };
    }
    const api = conn.api;
    const zThreadType = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    const sentTexts: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i > 0) await delay(SEGMENT_GAP_MS);
      try {
        if (seg.type === 'text' && seg.content) {
          const text = String(seg.content);
          await api.sendMessage({ msg: text }, threadId, zThreadType);
          sentTexts.push(text);
        } else if (seg.type === 'image') {
          const urls = Array.isArray(seg.content) ? seg.content : [seg.content];
          for (const url of urls) {
            if (!url || typeof url !== 'string') continue;
            await api.sendMessage({ msg: String(url) }, threadId, zThreadType);
            sentTexts.push(String(url));
          }
        }
      } catch (e) {
        Logger.warn(`[ZaloSender] send segment failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { ok: sentTexts.length > 0, sentCount: sentTexts.length, sentTexts };
  }
}
