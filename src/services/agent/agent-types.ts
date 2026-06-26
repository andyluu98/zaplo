/**
 * agent-types.ts
 * Kiểu dữ liệu lõi cho Agent đa-kênh (FB + Zalo).
 * 1 Agent trỏ 1 Trợ lý AI (brain) + nhiều target (account+channel+nhóm).
 */

export type Channel = 'fb' | 'zalo';
export type AgentType = 'posting' | 'chat' | 'comment';

/** 1 target = 1 tài khoản (1 kênh) + danh sách nhóm đích của tài khoản đó. */
export interface AgentTarget {
  channel: Channel;
  accountId: string;
  groupIds: string[];
}

export interface AgentDef {
  id?: number;
  name: string;
  assistantId: string;
  type: AgentType;
  targets: AgentTarget[];
}

/** 1 item gửi sau khi bung: route theo channel sang sender tương ứng. */
export interface AgentQueueItem {
  channel: Channel;
  accountId: string;
  target: string;        // group id
  content: string;
  imagePaths?: string[];
}
