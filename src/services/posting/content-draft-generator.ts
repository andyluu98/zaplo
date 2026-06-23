/**
 * ContentDraftGenerator
 *
 * Generates AI draft posts from a ContentPillar.
 * Uses AIAssistantService.chat() — same pattern as the rest of the app.
 */

import DatabaseService from '../database/DatabaseService';
import AIAssistantService from '../ai/AIAssistantService';
import Logger from '../../utils/Logger';

class ContentDraftGenerator {
    private static instance: ContentDraftGenerator;

    public static getInstance(): ContentDraftGenerator {
        if (!ContentDraftGenerator.instance) {
            ContentDraftGenerator.instance = new ContentDraftGenerator();
        }
        return ContentDraftGenerator.instance;
    }

    /**
     * Generate `count` AI drafts from a pillar and save them as pending.
     * Returns the IDs of saved drafts.
     *
     * @throws if no AI assistant is available or pillar not found
     */
    public async generateDrafts(
        zaloId: string,
        pillarId: number,
        count: number,
        opts?: { agentId?: number | null; agentAssistantId?: string | null; approve?: boolean },
    ): Promise<number[]> {
        const db = DatabaseService.getInstance();
        const ai = AIAssistantService.getInstance();

        const pillar = db.getContentPillar(zaloId, pillarId);
        if (!pillar) throw new Error(`Pillar ${pillarId} not found for account ${zaloId}`);

        // Resolve assistant: pillar's assistant → agent's assistant → default.
        const assistant =
            (pillar.assistant_id ? ai.getAssistant(pillar.assistant_id) : null) ||
            (opts?.agentAssistantId ? ai.getAssistant(opts.agentAssistantId) : null) ||
            ai.getDefaultAssistant();
        if (!assistant) throw new Error('Không có trợ lý AI nào khả dụng. Vui lòng thêm và bật ít nhất 1 trợ lý AI.');
        if (!assistant.enabled) throw new Error(`Trợ lý AI "${assistant.name}" đã bị tắt`);
        Logger.log(`[DraftGenerator] pillar ${pillarId} agent ${opts?.agentId ?? '-'} using assistant "${assistant.name}" (${assistant.id})`);

        const prompt = buildPillarPrompt(pillar);
        const savedIds: number[] = [];

        for (let i = 0; i < count; i++) {
            try {
                const { result } = await ai.chat(assistant.id, [{ role: 'user', content: prompt }]);
                if (!result || !result.trim()) {
                    Logger.warn(`[DraftGenerator] AI returned empty result for pillar ${pillarId} iteration ${i + 1}`);
                    continue;
                }
                const id = db.saveContentDraft({
                    owner_zalo_id: zaloId,
                    pillar_id: pillarId,
                    agent_id: opts?.agentId ?? null,
                    text: result.trim(),
                    image_asset_id: null,
                    approval_status: opts?.approve ? 'approved' : 'pending',
                    source: 'ai',
                });
                if (id) savedIds.push(id);
            } catch (err: any) {
                Logger.error(`[DraftGenerator] AI call failed at iteration ${i + 1}: ${err.message}`);
                throw err;
            }
        }

        Logger.log(`[DraftGenerator] Generated ${savedIds.length}/${count} drafts for pillar ${pillarId} (${zaloId})`);
        return savedIds;
    }
}

/** Build the user prompt from pillar fields */
function buildPillarPrompt(pillar: { name: string; description: string; prompt_template: string; tone: string }): string {
    // If the pillar has a custom prompt_template, use it with variable substitution
    if (pillar.prompt_template && pillar.prompt_template.trim()) {
        return pillar.prompt_template
            .replace(/\{name\}/g, pillar.name)
            .replace(/\{description\}/g, pillar.description)
            .replace(/\{tone\}/g, pillar.tone);
    }
    // Fallback: structured prompt from pillar fields
    return [
        `Viết 1 bài đăng lên nhóm Zalo theo chủ đề sau:`,
        `Chủ đề: ${pillar.name}`,
        pillar.description ? `Mô tả: ${pillar.description}` : '',
        pillar.tone ? `Giọng văn: ${pillar.tone}` : '',
        `Yêu cầu: Nội dung ngắn gọn, hấp dẫn, phù hợp đăng trên nhóm Zalo. Chỉ trả về nội dung bài đăng, không thêm tiêu đề hay giải thích.`,
    ].filter(Boolean).join('\n');
}

export default ContentDraftGenerator;
