/**
 * chat-agent-resolver — pure routing logic for the Chat Agent feature.
 *
 * Decides which ONE chat agent should handle an incoming conversation, so two agents
 * never reply to the same thread. Precedence (first match wins):
 *   1. Pinned    — conversation explicitly pinned to an agent (from the chat header).
 *   2. Label     — agent covers a label that the conversation carries.
 *   3. Group     — conversation/thread is in the agent's assigned thread list.
 *   4. Default   — a "tiếp nhận khách mới" agent, scoped to DM and/or group.
 * Disabled agents are skipped at every level (a disabled match falls through).
 * No production state here — caller supplies the data; easy to unit-test.
 */

export interface ChatAgentRule {
  id: number;
  enabled: boolean;
  threadIds: string[];                       // groups / conversations explicitly assigned
  labelIds: string[];                        // local-label ids this agent covers
  isDefault: boolean;                        // catches unassigned conversations
  defaultScope: { dm: boolean; group: boolean };
  defaultStrangerOnly: boolean;              // when default+dm: only reply to non-friends
  replyMode?: 'auto' | 'suggest';            // used by the decider (not by routing); default 'auto'
}

export interface ThreadCtx {
  threadId: string;
  threadType: 'user' | 'group';
  isFriend: boolean;
  labelIds: string[];
  pinnedAgentId: number | null;
}

const byId = (a: ChatAgentRule, b: ChatAgentRule) => a.id - b.id;

/** Returns the id of the agent that should handle this conversation, or null for no auto-reply. */
export function resolveChatAgent(thread: ThreadCtx, agents: ChatAgentRule[]): number | null {
  const enabled = agents.filter(a => a.enabled);

  // 1. Pinned (explicit override). A disabled/missing pin falls through to the rules below.
  if (thread.pinnedAgentId != null) {
    const pinned = enabled.find(a => a.id === thread.pinnedAgentId);
    if (pinned) return pinned.id;
  }

  // 2. Label
  const byLabel = enabled.filter(a => a.labelIds.some(l => thread.labelIds.includes(l))).sort(byId);
  if (byLabel.length) return byLabel[0].id;

  // 3. Group / explicit thread assignment
  const byThread = enabled.filter(a => a.threadIds.includes(thread.threadId)).sort(byId);
  if (byThread.length) return byThread[0].id;

  // 4. Default (tiếp nhận khách mới / hội thoại chưa gán)
  for (const d of enabled.filter(a => a.isDefault).sort(byId)) {
    const scopeOk = thread.threadType === 'user' ? d.defaultScope.dm : d.defaultScope.group;
    if (!scopeOk) continue;
    if (thread.threadType === 'user' && d.defaultStrangerOnly && thread.isFriend) continue;
    return d.id;
  }

  return null;
}
