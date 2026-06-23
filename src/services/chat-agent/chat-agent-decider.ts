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

/**
 * In a GROUP, only reply when the agent is addressed: self is @mentioned, OR the message
 * contains one of the agent's trigger keywords (case-insensitive). Prevents replying to
 * every group message. DMs do not use this gate.
 */
export function groupTriggerMatched(
  content: string,
  mentions: Array<{ uid: string }> | undefined,
  selfUid: string,
  keywords: string[],
): boolean {
  if (mentions?.some(m => m.uid === selfUid)) return true;
  const text = (content || '').toLowerCase();
  return keywords.some(k => k.trim() && text.includes(k.trim().toLowerCase()));
}

/**
 * Remove the bot's OWN @mention spans from a message before sending it to the AI.
 * In a group, addressing the bot ("@Esta Leasing chào bạn") would otherwise make the
 * assistant fixate on / "correct" the mentioned name instead of answering. We drop the
 * self-mention substrings (by TMention pos/len) and keep the real text ("chào bạn").
 * Mentions of other people are left intact.
 */
export function stripSelfMentions(
  content: string,
  mentions: Array<{ uid: string; pos: number; len: number }> | undefined,
  selfUid: string,
): string {
  let text = content || '';
  const selfM = (mentions || []).filter(
    m => m.uid === selfUid && Number.isFinite(m.pos) && Number.isFinite(m.len) && m.len > 0,
  );
  // Splice from the end so earlier positions stay valid.
  selfM.sort((a, b) => b.pos - a.pos);
  for (const m of selfM) text = text.slice(0, m.pos) + text.slice(m.pos + m.len);
  return text.replace(/\s{2,}/g, ' ').trim();
}

export interface PauseState { paused: number; paused_reason?: string; paused_at?: number }

/**
 * Should an auto-paused conversation hand back to the AI?
 * Only resumes a HUMAN handoff (reason='human') after `autoresumeMinutes` of silence.
 * Manual off (reason='manual') is never auto-resumed; 0 minutes disables auto-resume.
 */
export function shouldAutoResume(state: PauseState | null, autoresumeMinutes: number, now: number): boolean {
  if (!state || !state.paused) return false;
  if (state.paused_reason !== 'human') return false;
  if (!autoresumeMinutes || autoresumeMinutes <= 0) return false;
  return now - (state.paused_at ?? 0) >= autoresumeMinutes * 60_000;
}

export function decideChatReply(thread: ThreadCtx, agents: ChatAgentRule[], state: ConvState): ChatDecision {
  if (state.paused) return { agentId: null, mode: null, skip: 'paused' };

  const agentId = resolveChatAgent(thread, agents);
  if (agentId == null) return { agentId: null, mode: null, skip: 'no-agent' };

  const agent = agents.find(a => a.id === agentId);
  const mode = agent?.replyMode === 'suggest' ? 'suggest' : 'reply';
  return { agentId, mode, skip: null };
}
