/**
 * TDD — strip the bot's own @mention from a group message before feeding it to the AI.
 *
 * Bug repro: in a group the user tags "@Esta Leasing chào bạn". If the raw text (with the
 * mention) is sent to the assistant, the assistant fixates on the mentioned name and keeps
 * "correcting" it ("mình là LMak, không phải Esta Leasing") instead of answering. The fix:
 * remove self-mention spans (TMention uid === self) using their pos/len, leaving "chào bạn".
 */
import { stripSelfMentions, stripSelfMentionText } from '../services/chat-agent/chat-agent-decider';

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

/**
 * TDD — strip the bot's @mention from HISTORY by display name (no TMention pos/len available
 * for stored messages — the DB has no mentions column, content is "@Esta Leasing chào bạn").
 */
describe('stripSelfMentionText', () => {
  test('removes a leading "@Name" by display name', () => {
    expect(stripSelfMentionText('@Esta Leasing chào bạn', 'Esta Leasing')).toBe('chào bạn');
  });

  test('removes "@Name" mid-sentence too, collapses spaces', () => {
    expect(stripSelfMentionText('hi @Esta Leasing giá bao nhiêu', 'Esta Leasing')).toBe('hi giá bao nhiêu');
  });

  test('removes multiple occurrences', () => {
    expect(stripSelfMentionText('@Esta Leasing a @Esta Leasing b', 'Esta Leasing')).toBe('a b');
  });

  test('empty self name → unchanged', () => {
    expect(stripSelfMentionText('@Esta Leasing chào', '')).toBe('@Esta Leasing chào');
  });

  test('no mention of self → unchanged', () => {
    expect(stripSelfMentionText('giá thuê bao nhiêu', 'Esta Leasing')).toBe('giá thuê bao nhiêu');
  });

  test('does not touch a DIFFERENT @name', () => {
    expect(stripSelfMentionText('@Tuấn Anh ơi', 'Esta Leasing')).toBe('@Tuấn Anh ơi');
  });

  test('escapes regex-special characters in the name', () => {
    expect(stripSelfMentionText('@A.B (x) hello', 'A.B (x)')).toBe('hello');
  });

  test('bare self-mention only → empty', () => {
    expect(stripSelfMentionText('@Esta Leasing', 'Esta Leasing')).toBe('');
  });
});
