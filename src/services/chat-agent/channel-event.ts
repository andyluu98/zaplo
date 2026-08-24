/**
 * channel-event.ts — channel-agnostic contracts for the Chat Agent pipeline.
 *
 * ChatAgentDispatcher used to be hard-wired to Zalo at SEVEN points: the incoming
 * payload shape (zca-js), agent-rule lookup, per-thread AI state, thread labels,
 * friend check, account name, history, connection check, and the raw
 * `api.sendMessage` call. This module defines the seams that let ONE dispatcher
 * serve `zalo` and `page` (and, later, personal Messenger) without behaviour change
 * for Zalo:
 *
 *   - `ChannelEvent`      — normalised inbound message (produced by a per-channel adapter)
 *   - `ChannelContextProvider` — every account-keyed DB read/write, one impl per channel
 *   - `ChannelSender`     — the outbound send, one impl per channel
 *
 * NOTE: `ChatChannel` here is LOCAL to the chat pipeline and is deliberately NOT
 * `agent-types.Channel` / `deriveChannel` (that union belongs to the posting
 * subsystem and stays untouched — red-team M2).
 */

import type { ChatAgent } from '../../models';
import type { ChatAgentRule } from './chat-agent-resolver';
import type { AIStructuredSegment } from '../../utils/aiUtils';

/** Channels the chat auto-reply pipeline can drive. Local to this subsystem. */
export type ChatChannel = 'zalo' | 'page';

/**
 * A normalised inbound message. A per-channel adapter maps the raw provider
 * payload onto this shape, so the dispatcher never sees Zalo/Graph specifics.
 * `mentions` and `msgId` are carried because the dispatcher needs them for
 * group-trigger matching / self-mention stripping and AI-echo tagging.
 */
export interface ChannelEvent {
  channel: ChatChannel;
  accountId: string;                 // owning account (Zalo: zaloId, Page: page id)
  threadId: string;
  threadType: 'user' | 'group';
  senderId: string;                  // author of the message (uidFrom)
  senderName?: string;
  text: string;                      // human-readable text; self-@mention NOT yet stripped
  mentions?: Array<{ uid: string; pos?: number; len?: number }>;
  msgId?: string;
  ts: number;
  isSelf: boolean;                   // message the account itself sent (echo / human handoff)
}

/** Per-thread AI pause/pin state, mirroring the fields the decider consumes. */
export interface ChannelAiState {
  paused: number;                    // 1 | 0
  paused_reason?: string | null;
  paused_at?: number | null;
  pinned_agent_id?: number | null;
}

/** One turn of conversation history fed to the assistant. */
export interface ChannelHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Every account-keyed data access the dispatcher performs, behind one interface.
 * Zalo impl wraps the existing DatabaseService calls unchanged; Page impl (Phase
 * 2/3) reads the same unified tables filtered by `channel='page'`.
 */
export interface ChannelContextProvider {
  /** Enabled chat-agent rows for the account (resolver input; findAgent source). */
  getAgents(accountId: string): ChatAgent[];
  getAiState(accountId: string, threadId: string): ChannelAiState | null;
  setAiState(accountId: string, threadId: string, patch: Partial<ChannelAiState>): void;
  /** Past turns, oldest→newest, content already flattened to plain text. */
  getHistory(accountId: string, threadId: string, n: number): ChannelHistoryMessage[];
  /** Local-label ids (as strings) carried by this thread. */
  getLabelThreads(accountId: string, threadId: string): string[];
  isFriend(accountId: string, threadId: string): boolean;
  getAccountName(accountId: string): string;
  /** Best-effort: mark a stored message as AI-sent (echo bookkeeping). */
  tagSentByAi(accountId: string, msgId: string): void;
}

export interface SendSegmentsInput {
  accountId: string;
  threadId: string;
  threadType: 'user' | 'group';
  segments: AIStructuredSegment[];
}

export interface SendResult {
  ok: boolean;
  /** Number of segments actually delivered. */
  sentCount: number;
  /** The text of each delivered segment, so the caller can record it for echo suppression. */
  sentTexts: string[];
  /** Provider message ids, when the send API returns them (Page). */
  messageIds?: string[];
}

/**
 * The outbound send for one channel. Takes the SAME parsed segment array the
 * dispatcher already produces (text/image), so images survive (red-team H7) — not
 * a text-only `sendText`.
 */
export interface ChannelSender {
  send(p: SendSegmentsInput): Promise<SendResult>;
  /** Is the account currently reachable? Lets the dispatcher skip work (and LLM cost) when offline. */
  isReady?(accountId: string): boolean;
  setTyping?(p: { accountId: string; threadId: string; on: boolean }): Promise<void>;
  markSeen?(p: { accountId: string; threadId: string }): Promise<void>;
}

/** Re-export for convenience so channel impls need one import. */
export type { ChatAgentRule, AIStructuredSegment };

/**
 * Flatten a stored message's content to plain text. Rich types persist JSON
 * ({msg}/{title}); plain types are stored verbatim. Shared by every provider's
 * getHistory so channels agree on how history reads.
 */
export function plainMessageText(m: { content: string; msg_type?: string }): string {
  const raw = m.content || '';
  if (!raw) return '';
  if (raw.trim().startsWith('{')) {
    try {
      const o = JSON.parse(raw);
      return String(o.msg || o.title || '');
    } catch { /* fall through to raw */ }
  }
  return raw;
}
