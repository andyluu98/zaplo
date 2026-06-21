/**
 * auto-reply-workflow-manager.ts
 *
 * Manages hidden "AI auto-reply" workflows per Zalo account.
 *
 * Architecture: the hidden workflow IS the source of truth.
 * Workflow id is deterministic: `autoreply-{zaloId}`.
 *
 * Nodes:
 *   trigger.message  →  ai.generateText (assistantId)  →  zalo.sendMessage
 *
 * Variable interpolation (engine syntax confirmed from WorkflowEngineService.ts):
 *   - trigger output fields accessed via {{ $trigger.content }}, {{ $trigger.threadId }}, etc.
 *   - node output accessed via {{ $node.<label>.<field> }}
 *     The ai.generateText node returns { result: string, ... }
 *     So the sendMessage node uses {{ $node.AI.result }}
 */

import DatabaseService from '../database/DatabaseService';
import WorkflowEngineService from '../workflow/WorkflowEngineService';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../workflow/WorkflowEngineService';
import Logger from '../../utils/Logger';

/** Result of getAutoReplyStatus */
export interface AutoReplyStatus {
  enabled: boolean;
  assistantId: string | null;
}

/**
 * Build the deterministic workflow id for a Zalo account.
 */
function buildWorkflowId(zaloId: string): string {
  return `autoreply-${zaloId}`;
}

/**
 * Build the hidden auto-reply Workflow object.
 * Node IDs are stable (not random) so saveWorkflow upserts cleanly.
 */
function buildAutoReplyWorkflow(zaloId: string, assistantId: string): Workflow {
  const wfId = buildWorkflowId(zaloId);
  const now = Date.now();

  const triggerNode: WorkflowNode = {
    id: `${wfId}-trigger`,
    type: 'trigger.message',
    label: 'Tin nhắn mới',
    position: { x: 100, y: 100 },
    config: {
      // ignoreOwn defaults to true in the engine — no need to set it explicitly
      // threadType: 'all' means both DM and group
      threadType: 'all',
    },
  };

  const aiNode: WorkflowNode = {
    id: `${wfId}-ai`,
    type: 'ai.generateText',
    label: 'AI',
    position: { x: 400, y: 100 },
    config: {
      assistantId,
      // Pass the incoming message content as the prompt.
      // Engine syntax: {{ $trigger.<field> }} — content is flattened by flattenTriggerData.
      prompt: '{{ $trigger.content }}',
    },
  };

  const sendNode: WorkflowNode = {
    id: `${wfId}-send`,
    type: 'zalo.sendMessage',
    label: 'Gửi phản hồi',
    position: { x: 700, y: 100 },
    config: {
      // Engine syntax: {{ $node.<label>.<field> }} — ai.generateText returns { result }
      message: '{{ $node.AI.result }}',
      // threadId comes from the trigger context automatically via resolveTargetThreadIds
      // when cfg.threadId is a template expression
      threadId: '{{ $trigger.threadId }}',
      // threadType mirrors the incoming message (0=DM, 1=group)
      threadType: '{{ $trigger.threadType }}',
    },
  };

  const edges: WorkflowEdge[] = [
    { id: `${wfId}-e1`, source: triggerNode.id, target: aiNode.id },
    { id: `${wfId}-e2`, source: aiNode.id, target: sendNode.id },
  ];

  return {
    id: wfId,
    name: `[Auto] AI trả lời — ${zaloId}`,
    description: 'Tự động tạo bởi tính năng AI Auto-Reply. Không chỉnh sửa thủ công.',
    enabled: true,
    channel: 'zalo',
    pageIds: [zaloId],
    nodes: [triggerNode, aiNode, sendNode],
    edges,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable auto-reply for a Zalo account.
 * Creates or replaces the hidden workflow and registers it in the live engine.
 */
export function enableAutoReply(zaloId: string, assistantId: string): void {
  if (!zaloId) throw new Error('zaloId is required');
  if (!assistantId) throw new Error('assistantId is required');

  const wf = buildAutoReplyWorkflow(zaloId, assistantId);
  DatabaseService.getInstance().saveWorkflow(wf);

  // Verify the write landed — DatabaseService.saveWorkflow swallows errors silently.
  // If the row is missing or disabled, the toggle must surface as a failure.
  const saved = DatabaseService.getInstance().getWorkflowById(wf.id);
  if (!saved || !(saved.enabled === 1 || saved.enabled === true)) {
    throw new Error('Lưu cấu hình auto-reply thất bại');
  }

  // Reload into live engine so it starts listening immediately (no restart needed).
  // reloadWorkflow() reads from DB and upserts into the in-memory Map.
  WorkflowEngineService.getInstance().reloadWorkflow(wf.id);

  Logger.log(`[AutoReplyManager] Enabled auto-reply for zaloId=${zaloId}, assistantId=${assistantId}`);
}

/**
 * Disable auto-reply for a Zalo account.
 * Deletes the hidden workflow from DB and removes it from the live engine.
 */
export function disableAutoReply(zaloId: string): void {
  if (!zaloId) throw new Error('zaloId is required');

  const wfId = buildWorkflowId(zaloId);

  // If the workflow didn't exist to begin with, treat as success — already disabled.
  const existing = DatabaseService.getInstance().getWorkflowById(wfId);
  if (!existing) {
    Logger.log(`[AutoReplyManager] No workflow found for zaloId=${zaloId} — already disabled`);
    return;
  }

  DatabaseService.getInstance().deleteWorkflow(wfId);

  // Verify the delete landed — deleteWorkflow swallows errors silently.
  const stillPresent = DatabaseService.getInstance().getWorkflowById(wfId);
  if (stillPresent) {
    throw new Error('Xóa cấu hình auto-reply thất bại');
  }

  // Remove from live engine immediately.
  WorkflowEngineService.getInstance().removeWorkflow(wfId);

  Logger.log(`[AutoReplyManager] Disabled auto-reply for zaloId=${zaloId}`);
}

/**
 * Get current auto-reply status for a Zalo account.
 * Source of truth: the hidden workflow in DB.
 */
export function getAutoReplyStatus(zaloId: string): AutoReplyStatus {
  if (!zaloId) return { enabled: false, assistantId: null };

  const wfId = buildWorkflowId(zaloId);
  const row = DatabaseService.getInstance().getWorkflowById(wfId);

  if (!row) return { enabled: false, assistantId: null };

  const enabled = row.enabled === 1 || row.enabled === true;
  if (!enabled) return { enabled: false, assistantId: null };

  // Extract assistantId from the ai.generateText node config stored as JSON
  let assistantId: string | null = null;
  try {
    const nodes: WorkflowNode[] = JSON.parse(row.nodes_json || '[]');
    const aiNode = nodes.find(n => n.type === 'ai.generateText');
    assistantId = aiNode?.config?.assistantId || null;
  } catch {
    assistantId = null;
  }

  return { enabled: true, assistantId };
}
