import { normalizeModelName } from '../services/ai/normalize-model-name';

describe('normalizeModelName', () => {
  it('maps retired deepseek-chat / deepseek-reasoner to deepseek-v4-flash (red-team M1)', () => {
    expect(normalizeModelName('deepseek-chat')).toBe('deepseek-v4-flash');
    expect(normalizeModelName('deepseek-reasoner')).toBe('deepseek-v4-flash');
  });

  it('maps legacy fake versioned names', () => {
    expect(normalizeModelName('deepseek-chat-v3.2')).toBe('deepseek-v4-flash');
    expect(normalizeModelName('deepseek-reasoner-r1.5')).toBe('deepseek-v4-pro');
  });

  it('maps mistyped gemini ids', () => {
    expect(normalizeModelName('gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    expect(normalizeModelName('gemini-3.0-flash-lite')).toBe('gemini-3-flash-preview');
  });

  it('passes through current model ids unchanged', () => {
    for (const m of ['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-5.4-mini', 'claude-4.6-sonnet-20260301']) {
      expect(normalizeModelName(m)).toBe(m);
    }
  });
});
