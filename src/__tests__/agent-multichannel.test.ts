import { deriveChannel } from '../services/agent/derive-channel';
import { validateAgent } from '../services/agent/validate-agent';
import { expandAgentQueue } from '../services/agent/expand-agent-queue';
import type { AgentDef } from '../services/agent/agent-types';

// ─── deriveChannel ──────────────────────────────────────────────────────────
test('deriveChannel: lấy kênh từ account', () => {
  expect(deriveChannel({ channel: 'fb' })).toBe('fb');
  expect(deriveChannel({ channel: 'zalo' })).toBe('zalo');
});
test('deriveChannel: kênh thiếu/sai → throw', () => {
  expect(() => deriveChannel({} as any)).toThrow();
  expect(() => deriveChannel({ channel: 'tiktok' } as any)).toThrow();
});

// ─── validateAgent ──────────────────────────────────────────────────────────
const baseAgent = (over: Partial<AgentDef> = {}): AgentDef => ({
  name: 'A', assistantId: 'as1', type: 'posting',
  targets: [{ channel: 'fb', accountId: 'fb1', groupIds: ['g1'] }],
  ...over,
});
test('validateAgent: agent hợp lệ', () => {
  expect(validateAgent(baseAgent()).ok).toBe(true);
});
test('validateAgent: thiếu tên / assistant / target → lỗi', () => {
  expect(validateAgent(baseAgent({ name: ' ' })).ok).toBe(false);
  expect(validateAgent(baseAgent({ assistantId: '' })).ok).toBe(false);
  expect(validateAgent(baseAgent({ targets: [] })).ok).toBe(false);
});
test('validateAgent: target posting phải có nhóm; channel sai → lỗi', () => {
  expect(validateAgent(baseAgent({ targets: [{ channel: 'fb', accountId: 'fb1', groupIds: [] }] })).ok).toBe(false);
  expect(validateAgent(baseAgent({ targets: [{ channel: 'x' as any, accountId: 'a', groupIds: ['g'] }] })).ok).toBe(false);
});
test('validateAgent: chat không bắt buộc nhóm', () => {
  expect(validateAgent(baseAgent({ type: 'chat', targets: [{ channel: 'zalo', accountId: 'z1', groupIds: [] }] })).ok).toBe(true);
});

// ─── expandAgentQueue ───────────────────────────────────────────────────────
test('expandAgentQueue: bung bài × target × nhóm, mang đúng channel+account', () => {
  const agent = baseAgent({ targets: [
    { channel: 'fb', accountId: 'fb1', groupIds: ['g1', 'g2', 'g3'] },
    { channel: 'zalo', accountId: 'z1', groupIds: ['k1', 'k2'] },
  ]});
  const items = expandAgentQueue(agent, [{ content: 'Bài A' }]);
  expect(items).toHaveLength(5);
  expect(items.filter(i => i.channel === 'fb')).toHaveLength(3);
  expect(items.filter(i => i.channel === 'zalo')).toHaveLength(2);
  expect(items[0]).toMatchObject({ channel: 'fb', accountId: 'fb1', target: 'g1', content: 'Bài A' });
  expect(items[4]).toMatchObject({ channel: 'zalo', accountId: 'z1', target: 'k2' });
});
test('expandAgentQueue: nhiều bài × nhiều nhóm; bỏ bài rỗng', () => {
  const agent = baseAgent({ targets: [{ channel: 'fb', accountId: 'fb1', groupIds: ['g1', 'g2'] }] });
  expect(expandAgentQueue(agent, [{ content: 'A' }, { content: 'B' }])).toHaveLength(4);
  expect(expandAgentQueue(agent, [{ content: ' ' }])).toHaveLength(0);
});
test('expandAgentQueue: giữ imagePaths theo bài', () => {
  const agent = baseAgent({ targets: [{ channel: 'fb', accountId: 'fb1', groupIds: ['g1'] }] });
  const items = expandAgentQueue(agent, [{ content: 'A', imagePaths: ['p.jpg'] }]);
  expect(items[0].imagePaths).toEqual(['p.jpg']);
});
