/**
 * expand-agent-queue.ts
 * Bung agent đa-target thành danh sách item gửi: mỗi (bài × target × nhóm) = 1 item,
 * mang đúng channel + accountId để sender route. Thuần (dễ test).
 */
import type { AgentDef, AgentQueueItem } from './agent-types';

export type AgentDraft = { content: string; imagePaths?: string[] };

export function expandAgentQueue(agent: AgentDef, drafts: AgentDraft[]): AgentQueueItem[] {
  const out: AgentQueueItem[] = [];
  for (const d of drafts) {
    const content = (d.content || '').trim();
    if (!content) continue;
    for (const t of agent.targets) {
      for (const gid of t.groupIds) {
        out.push({
          channel: t.channel,
          accountId: t.accountId,
          target: gid,
          content,
          imagePaths: d.imagePaths || [],
        });
      }
    }
  }
  return out;
}
