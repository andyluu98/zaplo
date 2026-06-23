/**
 * chat-agent-decider — pure decision on what to do with an incoming message.
 *
 * Combines routing (resolveChatAgent) with the per-conversation pause state and the
 * winning agent's reply mode. Returns whether to reply, with which agent, and whether
 * to auto-send or only suggest. Keeping this pure makes the dispatcher trivial to test.
 */
import { resolveChatAgent, ChatAgentRule, ThreadCtx } from './chat-agent-resolver';

export interface ConvState { paused: boolean }
export interface ChatDecision {
  agentId: number | null;
  mode: 'reply' | 'suggest' | null;
  skip: 'paused' | 'no-agent' | null;
}

export function decideChatReply(thread: ThreadCtx, agents: ChatAgentRule[], state: ConvState): ChatDecision {
  if (state.paused) return { agentId: null, mode: null, skip: 'paused' };

  const agentId = resolveChatAgent(thread, agents);
  if (agentId == null) return { agentId: null, mode: null, skip: 'no-agent' };

  const agent = agents.find(a => a.id === agentId);
  const mode = agent?.replyMode === 'suggest' ? 'suggest' : 'reply';
  return { agentId, mode, skip: null };
}
