/**
 * agent-mc-ipc.ts
 * IPC cho Agent đa-kênh (mc_agent): liệt kê tài khoản FB+Zalo, nhóm theo tài khoản,
 * lưu/đọc/xóa agent + targets. Validate qua validateAgent (đã test).
 */
import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import { validateAgent } from '../../src/services/agent/validate-agent';
import type { AgentDef, AgentTarget } from '../../src/services/agent/agent-types';
import Logger from '../../src/utils/Logger';

function chOf(c?: string): 'fb' | 'zalo' { return c === 'facebook' ? 'fb' : 'zalo'; }

/** Gom agent_target rows → AgentTarget[] (gộp theo account+channel). */
function rowsToTargets(rows: Array<{ channel: string; account_id: string; group_id: string }>): AgentTarget[] {
  const map = new Map<string, AgentTarget>();
  for (const r of rows) {
    const key = `${r.channel}|${r.account_id}`;
    if (!map.has(key)) map.set(key, { channel: r.channel as any, accountId: r.account_id, groupIds: [] });
    if (r.group_id) map.get(key)!.groupIds.push(r.group_id);
  }
  return [...map.values()];
}

export function registerAgentMcIpc(): void {
  // Tài khoản FB + Zalo (cho bảng "Tài khoản phụ trách")
  ipcMain.handle('agent:mc.listAccounts', async () => {
    try {
      const accs = DatabaseService.getInstance().getAccounts();
      return { success: true, accounts: accs.map((a: any) => ({ id: a.zalo_id, channel: chOf(a.channel), name: a.full_name || a.zalo_id })) };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  // Nhóm của 1 tài khoản theo kênh
  ipcMain.handle('agent:mc.groups', async (_e, { accountId, channel }: { accountId: string; channel: 'fb' | 'zalo' }) => {
    try {
      const db = DatabaseService.getInstance();
      if (channel === 'fb') {
        return { success: true, groups: db.listFbGroups(accountId).map(g => ({ id: g.group_id, name: g.name })) };
      }
      const rows = db.query<any>(`SELECT contact_id, display_name FROM contacts WHERE owner_zalo_id=? AND contact_type='group' ORDER BY display_name`, [accountId]);
      return { success: true, groups: rows.map(r => ({ id: r.contact_id, name: r.display_name || r.contact_id })) };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('agent:mc.list', async () => {
    try {
      const db = DatabaseService.getInstance();
      const agents = db.listMcAgents().map((a: any) => {
        const targets = rowsToTargets(db.listAgentTargets(a.id));
        const channels = [...new Set(targets.map(t => t.channel))];
        const nGroups = targets.reduce((s, t) => s + t.groupIds.length, 0);
        return { ...a, channels, accountCount: targets.length, groupCount: nGroups };
      });
      return { success: true, agents };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('agent:mc.get', async (_e, { id }: { id: number }) => {
    try {
      const db = DatabaseService.getInstance();
      const a = db.getMcAgent(id);
      if (!a) return { success: false, error: 'Không tìm thấy agent' };
      return { success: true, agent: { ...a, targets: rowsToTargets(db.listAgentTargets(id)) } };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('agent:mc.save', async (_e, { agent }: { agent: AgentDef & { contentSource?: string; scheduleJson?: string; enabled?: boolean } }) => {
    try {
      const v = validateAgent(agent);
      if (!v.ok) return { success: false, error: v.errors.join(' ') };
      const db = DatabaseService.getInstance();
      const id = db.saveMcAgent({
        id: agent.id, name: agent.name.trim(), assistant_id: agent.assistantId, type: agent.type,
        content_source: agent.contentSource || 'store', schedule_json: agent.scheduleJson || '',
        enabled: agent.enabled ? 1 : 0,
      });
      const targetRows = agent.targets.flatMap(t =>
        (t.groupIds.length ? t.groupIds : ['']).map(g => ({ channel: t.channel, account_id: t.accountId, group_id: g }))
      );
      db.setAgentTargets(id, targetRows);
      return { success: true, id };
    } catch (e: any) { Logger.error(`[agent-mc] save: ${e.message}`); return { success: false, error: e.message }; }
  });

  ipcMain.handle('agent:mc.delete', async (_e, { id }: { id: number }) => {
    try { DatabaseService.getInstance().deleteMcAgent(id); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('agent:mc.setEnabled', async (_e, { id, enabled }: { id: number; enabled: boolean }) => {
    try { DatabaseService.getInstance().setMcAgentEnabled(id, enabled ? 1 : 0); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });
}
