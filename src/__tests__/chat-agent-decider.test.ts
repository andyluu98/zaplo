/**
 * TDD — Chat Agent reply decision (pure).
 * Wraps the router with per-conversation pause state + the agent's reply mode to answer:
 * should we act on this incoming message, with which agent, auto-send or just suggest?
 */
import { decideChatReply } from '../services/chat-agent/chat-agent-decider';
import { ChatAgentRule, ThreadCtx } from '../services/chat-agent/chat-agent-resolver';

const agent = (over: Partial<ChatAgentRule>): ChatAgentRule => ({
  id: 1, enabled: true, threadIds: [], labelIds: [], isDefault: false,
  defaultScope: { dm: false, group: false }, defaultStrangerOnly: false, replyMode: 'auto', ...over,
});
const thread = (over: Partial<ThreadCtx>): ThreadCtx => ({
  threadId: 't1', threadType: 'group', isFriend: true, labelIds: [], pinnedAgentId: null, ...over,
});

describe('decideChatReply', () => {
  test('paused conversation → skip (human is handling)', () => {
    const d = decideChatReply(thread({ threadId: 't1' }), [agent({ id: 1, threadIds: ['t1'] })], { paused: true });
    expect(d).toEqual({ agentId: null, mode: null, skip: 'paused' });
  });

  test('no agent matches → skip no-agent', () => {
    const d = decideChatReply(thread({ threadId: 'x' }), [agent({ id: 1, threadIds: ['other'] })], { paused: false });
    expect(d).toEqual({ agentId: null, mode: null, skip: 'no-agent' });
  });

  test('matched auto agent → reply', () => {
    const d = decideChatReply(thread({ threadId: 't1' }), [agent({ id: 5, threadIds: ['t1'], replyMode: 'auto' })], { paused: false });
    expect(d).toEqual({ agentId: 5, mode: 'reply', skip: null });
  });

  test('matched suggest agent → suggest (do not auto-send)', () => {
    const d = decideChatReply(thread({ threadId: 't1' }), [agent({ id: 6, threadIds: ['t1'], replyMode: 'suggest' })], { paused: false });
    expect(d).toEqual({ agentId: 6, mode: 'suggest', skip: null });
  });

  test('pin precedence flows through to decision', () => {
    const agents = [agent({ id: 1, threadIds: ['t1'], replyMode: 'auto' }), agent({ id: 2, replyMode: 'suggest' })];
    const d = decideChatReply(thread({ threadId: 't1', pinnedAgentId: 2 }), agents, { paused: false });
    expect(d).toEqual({ agentId: 2, mode: 'suggest', skip: null });
  });

  test('default replyMode is reply when unset', () => {
    const a = { ...agent({ id: 9, threadIds: ['t1'] }) }; delete (a as any).replyMode;
    const d = decideChatReply(thread({ threadId: 't1' }), [a], { paused: false });
    expect(d).toEqual({ agentId: 9, mode: 'reply', skip: null });
  });
});
