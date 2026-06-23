/**
 * TDD — strip the bot's own @mention from a group message before feeding it to the AI.
 *
 * Bug repro: in a group the user tags "@Esta Leasing chào bạn". If the raw text (with the
 * mention) is sent to the assistant, the assistant fixates on the mentioned name and keeps
 * "correcting" it ("mình là LMak, không phải Esta Leasing") instead of answering. The fix:
 * remove self-mention spans (TMention uid === self) using their pos/len, leaving "chào bạn".
 */
import { stripSelfMentions } from '../services/chat-agent/chat-agent-decider';

const SELF = 'acc-self';

describe('stripSelfMentions', () => {
  test('removes a leading self-mention, keeps the real question', () => {
    expect(stripSelfMentions('@Esta Leasing chào bạn', [{ uid: SELF, pos: 0, len: 13 }], SELF)).toBe('chào bạn');
  });

  test('keeps mentions of OTHER users, removes only self', () => {
    // "@Bob hi @Esta Leasing there" — @Bob pos0 len4, self pos8 len13
    const text = '@Bob hi @Esta Leasing there';
    const r = stripSelfMentions(text, [{ uid: 'bob', pos: 0, len: 4 }, { uid: SELF, pos: 8, len: 13 }], SELF);
    expect(r).toBe('@Bob hi there');
  });

  test('no mentions → unchanged', () => {
    expect(stripSelfMentions('giá thuê bao nhiêu', undefined, SELF)).toBe('giá thuê bao nhiêu');
  });

  test('bare self-mention only → empty', () => {
    expect(stripSelfMentions('@Esta Leasing', [{ uid: SELF, pos: 0, len: 13 }], SELF)).toBe('');
  });

  test('mention not targeting self → unchanged', () => {
    expect(stripSelfMentions('@Bob hello', [{ uid: 'bob', pos: 0, len: 4 }], SELF)).toBe('@Bob hello');
  });

  test('collapses the gap left behind + trims', () => {
    expect(stripSelfMentions('hi @Esta Leasing nhé', [{ uid: SELF, pos: 3, len: 13 }], SELF)).toBe('hi nhé');
  });
});
