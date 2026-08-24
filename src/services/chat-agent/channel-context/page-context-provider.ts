/**
 * PageContextProvider — the Facebook Page implementation of ChannelContextProvider.
 *
 * Page conversation data lives in the SAME unified tables as Zalo, tagged
 * `channel='page'` (accounts/contacts/messages) — so history/name reuse the exact
 * DatabaseService reads, keyed by page_id (unique, never collides with a zalo_id).
 * Agent rules + AI state are filtered by channel so Page and Zalo never leak into
 * each other (red-team C4/C6). Labels/friendship don't exist for a Page → empty/false.
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

const CHANNEL = 'page';

export class PageContextProvider implements ChannelContextProvider {
    getAgents(accountId: string): ChatAgent[] {
        return DatabaseService.getInstance().listEnabledChatAgents(accountId, CHANNEL);
    }

    getAiState(accountId: string, threadId: string): ChannelAiState | null {
        const s = DatabaseService.getInstance().getConversationAiState(accountId, threadId, CHANNEL);
        if (!s) return null;
        return {
            paused: s.paused,
            paused_reason: s.paused_reason,
            paused_at: s.paused_at,
            pinned_agent_id: s.pinned_agent_id ?? null,
        };
    }

    setAiState(accountId: string, threadId: string, patch: Partial<ChannelAiState>): void {
        DatabaseService.getInstance().setConversationAiState(accountId, threadId, patch as Partial<ConversationAiState>, CHANNEL);
    }

    getHistory(accountId: string, threadId: string, n: number): ChannelHistoryMessage[] {
        // getMessages keys by owner_zalo_id (=page_id) + thread_id (=PSID); newest→oldest.
        return DatabaseService.getInstance().getMessages(accountId, threadId, n)
            .slice()
            .reverse()
            .map((m) => ({
                role: (m.is_sent ? 'assistant' : 'user') as 'assistant' | 'user',
                content: plainMessageText(m),
            }));
    }

    /** A Page has no local labels — trigger-by-label never applies. */
    getLabelThreads(_accountId: string, _threadId: string): string[] {
        return [];
    }

    /** Messenger has no Page↔user "friend" relation — treat everyone as a stranger. */
    isFriend(_accountId: string, _threadId: string): boolean {
        return false;
    }

    getAccountName(accountId: string): string {
        return DatabaseService.getInstance().getAccountName(accountId);
    }

    tagSentByAi(accountId: string, msgId: string): void {
        if (!msgId) return;
        try {
            DatabaseService.getInstance().run(
                `UPDATE messages SET sent_by='ai' WHERE owner_zalo_id=? AND msg_id=? AND channel='page'`,
                [accountId, msgId],
            );
        } catch (e) {
            Logger.warn(`[PageContextProvider] tagSentByAi: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
