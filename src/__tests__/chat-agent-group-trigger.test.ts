/**
 * TDD — group reply gate.
 * In a GROUP, the agent only replies when addressed: it is @mentioned, or the message
 * contains one of the agent's trigger keywords. (DMs don't use this gate.)
 */
import { groupTriggerMatched } from '../services/chat-agent/chat-agent-decider';

const SELF = 'acc-uid-1';

describe('groupTriggerMatched', () => {
  test('mentioned (self uid in mentions) → reply', () => {
    expect(groupTriggerMatched('chào shop', [{ uid: SELF }], SELF, [])).toBe(true);
  });
  test('mention of someone else → no reply', () => {
    expect(groupTriggerMatched('chào @ai đó', [{ uid: 'other' }], SELF, [])).toBe(false);
  });
  test('keyword match (case-insensitive) → reply', () => {
    expect(groupTriggerMatched('cho hỏi BÁO GIÁ thuê VP', undefined, SELF, ['báo giá', 'giá'])).toBe(true);
  });
  test('no mention + no keyword → no reply', () => {
    expect(groupTriggerMatched('mọi người ăn cơm chưa', undefined, SELF, ['báo giá'])).toBe(false);
  });
  test('empty keywords + no mention → no reply (require trigger)', () => {
    expect(groupTriggerMatched('bất kỳ tin nào', undefined, SELF, [])).toBe(false);
  });
  test('mentions undefined is safe', () => {
    expect(groupTriggerMatched('text', undefined, SELF, ['text'])).toBe(true);
  });
});
