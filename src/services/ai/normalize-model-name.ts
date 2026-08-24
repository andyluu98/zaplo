/**
 * normalize-model-name.ts
 *
 * Single source of truth for mapping legacy / retired / mistyped model IDs to
 * the current API model IDs. Previously duplicated in AIAssistantService and
 * WorkflowEngineService — the two copies drifted, so a model retired in one path
 * kept failing in the other. Both now import this.
 *
 * DeepSeek retired `deepseek-chat` and `deepseek-reasoner` on 2026-07-24; per
 * DeepSeek's own migration table both map to `deepseek-v4-flash` (flash serves
 * thinking + non-thinking modes via the `thinking` request param).
 */
export function normalizeModelName(model: string): string {
  const aliases: Record<string, string> = {
    // DeepSeek — retired 2026-07-24 (map to current flash model)
    'deepseek-chat':         'deepseek-v4-flash',
    'deepseek-reasoner':     'deepseek-v4-flash',
    // DeepSeek — fake versioned names that were never real API model IDs
    'deepseek-chat-v3.2':    'deepseek-v4-flash',
    'deepseek-chat-v3.1':    'deepseek-v4-flash',
    'deepseek-reasoner-r1.5':'deepseek-v4-pro',
    // Gemini — wrong model IDs (missing -preview suffix or wrong version)
    'gemini-3.1-pro':        'gemini-3.1-pro-preview',
    'gemini-3.1-flash':      'gemini-3.5-flash',
    'gemini-3.0-flash':      'gemini-3-flash-preview',
    'gemini-3.0-flash-lite': 'gemini-3-flash-preview',
  };
  return aliases[model] ?? model;
}
