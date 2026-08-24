/**
 * thinking-support.ts
 *
 * Helpers for DeepSeek V4 "thinking mode". Kept separate from AIAssistantService
 * so the platform-gating and response-parsing logic is unit-testable without
 * Electron / network.
 *
 * DeepSeek V4 (deepseek-v4-flash / deepseek-v4-pro) exposes chain-of-thought via
 * a top-level `thinking` request field (HTTP/OpenAI-compatible form — NOT the
 * OpenAI-SDK `extra_body` wrapper, which does not apply to raw axios calls), and
 * returns the reasoning in `choices[0].message.reasoning_content`, sibling to
 * `content`. Ref: https://api-docs.deepseek.com/guides/thinking_mode
 *
 * Only DeepSeek supports this; sending `thinking` to OpenAI/Gemini/Claude/etc
 * would corrupt their requests, so the gate is strict.
 */

/** Platforms whose OpenAI-compatible endpoint accepts the `thinking` field. */
export function supportsThinking(platform: string): boolean {
  return platform === 'deepseek';
}

/**
 * Request-body fragment to enable thinking, or `{}` when not applicable.
 * Spread into the OpenAI-compatible body.
 */
export function thinkingRequestBody(platform: string, enabled: boolean): Record<string, unknown> {
  if (enabled && supportsThinking(platform)) {
    return { thinking: { type: 'enabled' } };
  }
  return {};
}

/**
 * Extract the chain-of-thought from an OpenAI-compatible response.
 * Returns '' when thinking was off, unsupported, or the field is absent.
 */
export function extractReasoning(responseData: any): string {
  const r = responseData?.choices?.[0]?.message?.reasoning_content;
  return typeof r === 'string' ? r.trim() : '';
}

/**
 * When thinking is on, reasoning tokens are billed as completion tokens and draw
 * from the same max_tokens budget as the answer — a small default (e.g. 1000)
 * would truncate the answer mid-JSON. Raise the ceiling so the answer survives.
 */
export function thinkingMaxTokens(baseMaxTokens: number, enabled: boolean, platform: string): number {
  if (enabled && supportsThinking(platform)) {
    return Math.max(baseMaxTokens, 4096);
  }
  return baseMaxTokens;
}
