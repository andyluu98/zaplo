/**
 * ZaloContextProvider — the Zalo implementation of ChannelContextProvider.
 *
 * It wraps the EXISTING DatabaseService calls verbatim (keyed by owner_zalo_id),
 * so moving the dispatcher behind the provider changes no Zalo behaviour. The
 * only transform is mapping the DB row shapes onto the channel-neutral types.
 */

import DatabaseService from '../../database/DatabaseService';
import Logger from '../../../utils/Logger';
import type { ChatAgent, ConversationAiState } from '../../../models';
import {
  ChannelContextProvider,
  ChannelAiState,
  ChannelHistoryMessage,
  plainMessageText,
} from '../channel-event';

export class ZaloContextProvider implements ChannelContextProvider {
  getAgents(accountId: string): ChatAgent[] {
    return DatabaseService.getInstance().listEnabledChatAgents(accountId);
  }

  getAiState(accountId: string, threadId: string): ChannelAiState | null {
    const s = DatabaseService.getInstance().getConversationAiState(accountId, threadId);
    if (!s) return null;
    return {
      paused: s.paused,
      paused_reason: s.paused_reason,
      paused_at: s.paused_at,
      pinned_agent_id: s.pinned_agent_id ?? null,
    };
  }

  setAiState(accountId: string, threadId: string, patch: Partial<ChannelAiState>): void {
    // ChannelAiState fields are a 1:1 subset of ConversationAiState.
    DatabaseService.getInstance().setConversationAiState(accountId, threadId, patch as Partial<ConversationAiState>);
  }

  getHistory(accountId: string, threadId: string, n: number): ChannelHistoryMessage[] {
    // getMessages returns newest→oldest; reverse to old→new for the LLM.
    return DatabaseService.getInstance().getMessages(accountId, threadId, n)
      .slice()
      .reverse()
      .map(m => ({
        role: (m.is_sent ? 'assistant' : 'user') as 'assistant' | 'user',
        content: plainMessageText(m),
      }));
  }

  getLabelThreads(accountId: string, threadId: string): string[] {
    // local_label_threads.label_id is numeric → String() for resolver match.
    return DatabaseService.getInstance().getLocalLabelThreads(accountId)
      .filter(r => r.thread_id === threadId)
      .map(r => String(r.label_id));
  }

  isFriend(accountId: string, threadId: string): boolean {
    return DatabaseService.getInstance().checkIsFriend(accountId, threadId);
  }

  getAccountName(accountId: string): string {
    return DatabaseService.getInstance().getAccountName(accountId);
  }

  tagSentByAi(accountId: string, msgId: string): void {
    if (!msgId) return;
    try {
      DatabaseService.getInstance().run(
        `UPDATE messages SET sent_by='ai' WHERE owner_zalo_id=? AND msg_id=?`,
        [accountId, msgId],
      );
    } catch (e) {
      Logger.warn(`[ZaloContextProvider] tagSentByAi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
