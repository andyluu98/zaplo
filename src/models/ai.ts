export type AIPlatform = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'grok' | 'mistral' | '9router' | 'openrouter';

export interface AIAssistant {
    id: string;
    name: string;
    platform: AIPlatform;
    apiKey: string;
    model: string;
    systemPrompt: string;
    baseUrl: string | null;
    posIntegrationId: string | null;
    pinnedProductsJson: string;
    maxTokens: number;
    temperature: number;
    contextMessageCount: number;
    enabled: boolean;
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface AIAssistantFile {
    id: number;
    assistantId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    contentText: string;
    createdAt: number;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    /**
     * Image URLs attached to this turn (customer-sent photos). Only consumed on
     * the vision path (`isVisionModel`) for the OpenAI-compatible provider; every
     * other model ignores it and sends `content` as a plain string. Optional so
     * the Zalo/plain-text path is unchanged.
     */
    images?: string[];
}

export interface AIUsageLog {
    id?: number;
    assistant_id: string;
    assistant_name: string;
    platform: string;
    model: string;
    prompt_text: string;
    response_text: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    created_at: number;
}

export interface AIAccountAssistant {
    id?: number;
    zalo_id: string;
    role: 'suggestion' | 'panel';
    assistant_id: string;
}

/**
 * Chain-of-thought behind one AI reply. Stored in ai_reasoning_log, which is
 * NOT synced to employee machines (holds customer message + knowledge + internal
 * policy). Keyed to the reply via (channel, account_id, thread_id, msg_id).
 */
export interface AIReasoningLog {
    id?: number;
    channel: string;
    account_id: string;
    thread_id: string;
    msg_id: string;
    assistant_id: string;
    reasoning_text: string;
    created_at: number;
}
