/**
 * validate-agent.ts
 * Kiểm tra agent hợp lệ trước khi lưu/chạy.
 */
import type { AgentDef } from './agent-types';

export function validateAgent(agent: AgentDef): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!agent.name || !agent.name.trim()) errors.push('Thiếu tên Agent.');
  if (!agent.assistantId) errors.push('Chưa chọn Trợ lý AI.');
  if (!agent.targets || agent.targets.length === 0) errors.push('Cần ít nhất 1 tài khoản phụ trách.');

  for (const t of agent.targets || []) {
    if (t.channel !== 'fb' && t.channel !== 'zalo') errors.push(`Kênh không hợp lệ: ${t.channel}`);
    if (!t.accountId) errors.push('Target thiếu tài khoản.');
    // Đăng bài (posting) bắt buộc có nhóm; chat/comment không bắt buộc.
    if (agent.type === 'posting' && (!t.groupIds || t.groupIds.length === 0)) {
      errors.push(`Tài khoản ${t.accountId} chưa chọn nhóm đích.`);
    }
  }
  return { ok: errors.length === 0, errors };
}
