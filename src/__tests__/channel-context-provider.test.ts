// ZaloContextProvider must forward each call to DatabaseService unchanged (keyed by
// owner_zalo_id) and only translate row shapes — so routing the dispatcher through
// the provider changes no Zalo behaviour. DatabaseService is mocked (no Electron).

const mockDb = {
  listEnabledChatAgents: jest.fn(),
  getConversationAiState: jest.fn(),
  setConversationAiState: jest.fn(),
  getMessages: jest.fn(),
  getLocalLabelThreads: jest.fn(),
  checkIsFriend: jest.fn(),
  getAccountName: jest.fn(),
  run: jest.fn(),
};

jest.mock('../services/database/DatabaseService', () => ({
  __esModule: true,
  default: { getInstance: () => mockDb },
}));

import { ZaloContextProvider } from '../services/chat-agent/channel-context/zalo-context-provider';
import { plainMessageText } from '../services/chat-agent/channel-event';

const p = new ZaloContextProvider();

beforeEach(() => {
  for (const fn of Object.values(mockDb)) fn.mockReset();
});

describe('plainMessageText', () => {
  it('returns raw plain text', () => {
    expect(plainMessageText({ content: 'hello' })).toBe('hello');
  });
  it('extracts msg/title from JSON content', () => {
    expect(plainMessageText({ content: '{"msg":"hi there"}' })).toBe('hi there');
    expect(plainMessageText({ content: '{"title":"Card"}' })).toBe('Card');
  });
  it('falls back to raw when JSON is malformed', () => {
    expect(plainMessageText({ content: '{not json' })).toBe('{not json');
  });
});

describe('ZaloContextProvider', () => {
  it('getHistory reverses newest→oldest into old→new and flattens content', () => {
    mockDb.getMessages.mockReturnValue([
      { content: 'newest', is_sent: 0 },
      { content: '{"msg":"middle"}', is_sent: 1 },
      { content: 'oldest', is_sent: 0 },
    ]);
    expect(p.getHistory('acc1', 't1', 30)).toEqual([
      { role: 'user', content: 'oldest' },
      { role: 'assistant', content: 'middle' },
      { role: 'user', content: 'newest' },
    ]);
    expect(mockDb.getMessages).toHaveBeenCalledWith('acc1', 't1', 30);
  });

  it('getLabelThreads keeps only the given thread and stringifies label ids', () => {
    mockDb.getLocalLabelThreads.mockReturnValue([
      { thread_id: 't1', label_id: 5 },
      { thread_id: 't2', label_id: 7 },
      { thread_id: 't1', label_id: 9 },
    ]);
    expect(p.getLabelThreads('acc1', 't1')).toEqual(['5', '9']);
  });

  it('getAiState maps the row and null-coalesces pinned_agent_id', () => {
    mockDb.getConversationAiState.mockReturnValue({ paused: 1, paused_reason: 'human', paused_at: 42 });
    expect(p.getAiState('acc1', 't1')).toEqual({ paused: 1, paused_reason: 'human', paused_at: 42, pinned_agent_id: null });
    mockDb.getConversationAiState.mockReturnValue(null);
    expect(p.getAiState('acc1', 't1')).toBeNull();
  });

  it('isFriend / getAccountName forward through', () => {
    mockDb.checkIsFriend.mockReturnValue(true);
    mockDb.getAccountName.mockReturnValue('Shop A');
    expect(p.isFriend('acc1', 'u9')).toBe(true);
    expect(p.getAccountName('acc1')).toBe('Shop A');
    expect(mockDb.checkIsFriend).toHaveBeenCalledWith('acc1', 'u9');
  });

  it('tagSentByAi updates messages by owner + msg id, no-op on empty id', () => {
    p.tagSentByAi('acc1', 'm1');
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE messages SET sent_by='ai'"),
      ['acc1', 'm1'],
    );
    mockDb.run.mockReset();
    p.tagSentByAi('acc1', '');
    expect(mockDb.run).not.toHaveBeenCalled();
  });
});
