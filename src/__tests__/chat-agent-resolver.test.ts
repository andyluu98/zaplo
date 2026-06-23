/**
 * TDD — Chat Agent routing resolver.
 * Pure function: given a conversation + the account's chat agents, decide which ONE agent
 * handles it. Precedence (first match wins): pinned > label > group/thread list > default.
 * Disabled agents are skipped at every level (a disabled match falls through).
 */
import { resolveChatAgent, ChatAgentRule, ThreadCtx } from '../services/chat-agent/chat-agent-resolver';

const agent = (over: Partial<ChatAgentRule>): ChatAgentRule => ({
  id: 1, enabled: true, threadIds: [], labelIds: [], isDefault: false,
  defaultScope: { dm: false, group: false }, defaultStrangerOnly: false, ...over,
});
const thread = (over: Partial<ThreadCtx>): ThreadCtx => ({
  threadId: 't1', threadType: 'group', isFriend: true, labelIds: [], pinnedAgentId: null, ...over,
});

describe('resolveChatAgent', () => {
  test('pin: conversation pinned to an enabled agent → that agent', () => {
    const agents = [agent({ id: 1 }), agent({ id: 2 })];
    expect(resolveChatAgent(thread({ pinnedAgentId: 2 }), agents)).toBe(2);
  });

  test('pin to a disabled agent → falls through to next levels', () => {
    const agents = [agent({ id: 2, enabled: false }), agent({ id: 3, threadIds: ['t1'] })];
    expect(resolveChatAgent(thread({ threadId: 't1', pinnedAgentId: 2 }), agents)).toBe(3);
  });

  test('label: conversation label matches an agent label → that agent', () => {
    const agents = [agent({ id: 5, labelIds: ['vp'] })];
    expect(resolveChatAgent(thread({ labelIds: ['vp'] }), agents)).toBe(5);
  });

  test('group: thread in agent threadIds → that agent', () => {
    const agents = [agent({ id: 7, threadIds: ['g99'] })];
    expect(resolveChatAgent(thread({ threadId: 'g99' }), agents)).toBe(7);
  });

  test('precedence: pin beats label beats group', () => {
    const agents = [
      agent({ id: 1, threadIds: ['t1'] }),   // group match
      agent({ id: 2, labelIds: ['vp'] }),     // label match
      agent({ id: 3 }),                        // pin target
    ];
    const t = thread({ threadId: 't1', labelIds: ['vp'], pinnedAgentId: 3 });
    expect(resolveChatAgent(t, agents)).toBe(3);            // pin wins
    expect(resolveChatAgent({ ...t, pinnedAgentId: null }, agents)).toBe(2); // then label
    expect(resolveChatAgent({ ...t, pinnedAgentId: null, labelIds: [] }, agents)).toBe(1); // then group
  });

  test('default: unassigned DM → default agent with dm scope', () => {
    const agents = [agent({ id: 9, isDefault: true, defaultScope: { dm: true, group: false } })];
    expect(resolveChatAgent(thread({ threadType: 'user', threadId: 'u1' }), agents)).toBe(9);
  });

  test('default: unassigned group → default agent with group scope', () => {
    const agents = [agent({ id: 9, isDefault: true, defaultScope: { dm: false, group: true } })];
    expect(resolveChatAgent(thread({ threadType: 'group', threadId: 'gX' }), agents)).toBe(9);
  });

  test('default strangerOnly: known friend DM → no reply (null)', () => {
    const agents = [agent({ id: 9, isDefault: true, defaultScope: { dm: true, group: false }, defaultStrangerOnly: true })];
    expect(resolveChatAgent(thread({ threadType: 'user', isFriend: true }), agents)).toBeNull();
    expect(resolveChatAgent(thread({ threadType: 'user', isFriend: false }), agents)).toBe(9);
  });

  test('default scope respected: DM-only default does not catch a group', () => {
    const agents = [agent({ id: 9, isDefault: true, defaultScope: { dm: true, group: false } })];
    expect(resolveChatAgent(thread({ threadType: 'group' }), agents)).toBeNull();
  });

  test('no match and no default → null', () => {
    expect(resolveChatAgent(thread({ threadId: 'x' }), [agent({ id: 1, threadIds: ['other'] })])).toBeNull();
  });

  test('disabled agents are skipped at every level', () => {
    const agents = [
      agent({ id: 1, enabled: false, labelIds: ['vp'] }),
      agent({ id: 2, enabled: false, threadIds: ['t1'] }),
      agent({ id: 3, enabled: false, isDefault: true, defaultScope: { dm: true, group: true } }),
    ];
    expect(resolveChatAgent(thread({ threadId: 't1', labelIds: ['vp'], threadType: 'user' }), agents)).toBeNull();
  });

  test('deterministic: lowest id wins when multiple agents match the same level', () => {
    const agents = [agent({ id: 8, threadIds: ['t1'] }), agent({ id: 4, threadIds: ['t1'] })];
    expect(resolveChatAgent(thread({ threadId: 't1' }), agents)).toBe(4);
  });
});
