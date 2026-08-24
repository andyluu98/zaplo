import { supportsThinking, thinkingRequestBody, extractReasoning, thinkingMaxTokens } from '../services/ai/thinking-support';

describe('thinking-support', () => {
  describe('supportsThinking', () => {
    it('true only for deepseek', () => {
      expect(supportsThinking('deepseek')).toBe(true);
    });
    it('false for other platforms', () => {
      for (const p of ['openai', 'gemini', 'claude', 'openrouter', 'grok', 'mistral', '9router']) {
        expect(supportsThinking(p)).toBe(false);
      }
    });
    it('false for the deepseek vision model (thinking unconfirmed there)', () => {
      expect(supportsThinking('deepseek', 'deepseek-v4-flash-vision-exp')).toBe(false);
      expect(supportsThinking('deepseek', 'deepseek-v4-flash')).toBe(true);
    });
  });

  describe('thinkingRequestBody', () => {
    it('emits thinking param when enabled on deepseek', () => {
      expect(thinkingRequestBody('deepseek', true)).toEqual({ thinking: { type: 'enabled' } });
    });
    it('empty when disabled even on deepseek', () => {
      expect(thinkingRequestBody('deepseek', false)).toEqual({});
    });
    it('empty when enabled on unsupported platform (never corrupt their body)', () => {
      expect(thinkingRequestBody('openai', true)).toEqual({});
      expect(thinkingRequestBody('claude', true)).toEqual({});
      expect(thinkingRequestBody('gemini', true)).toEqual({});
    });
    it('empty when enabled on the deepseek vision model', () => {
      expect(thinkingRequestBody('deepseek', true, 'deepseek-v4-flash-vision-exp')).toEqual({});
      expect(thinkingRequestBody('deepseek', true, 'deepseek-v4-flash')).toEqual({ thinking: { type: 'enabled' } });
    });
  });

  describe('extractReasoning', () => {
    it('reads reasoning_content when present', () => {
      const data = { choices: [{ message: { content: 'answer', reasoning_content: '  the thought  ' } }] };
      expect(extractReasoning(data)).toBe('the thought');
    });
    it('empty string when reasoning_content absent', () => {
      expect(extractReasoning({ choices: [{ message: { content: 'answer' } }] })).toBe('');
    });
    it('empty string on malformed / missing response', () => {
      expect(extractReasoning(undefined)).toBe('');
      expect(extractReasoning({})).toBe('');
      expect(extractReasoning({ choices: [] })).toBe('');
    });
  });

  describe('thinkingMaxTokens', () => {
    it('raises tiny budget to at least 4096 when thinking on', () => {
      expect(thinkingMaxTokens(1000, true, 'deepseek')).toBe(4096);
      expect(thinkingMaxTokens(50, true, 'deepseek')).toBe(4096);
    });
    it('keeps a larger budget as-is', () => {
      expect(thinkingMaxTokens(8000, true, 'deepseek')).toBe(8000);
    });
    it('does not raise when thinking off or unsupported', () => {
      expect(thinkingMaxTokens(1000, false, 'deepseek')).toBe(1000);
      expect(thinkingMaxTokens(1000, true, 'openai')).toBe(1000);
    });
  });
});
