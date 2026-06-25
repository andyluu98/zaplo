/**
 * random-pool-runner.ts (main)
 * Agent random-pool: xáo-cycle Kho bài → đăng đều theo perDay + khung giờ, lặp vô hạn đến khi tắt.
 * Hỗ trợ target FB (tái dùng postScheduledItem). State pacing in-memory (reset khi restart).
 */
import DatabaseService from '../database/DatabaseService';
import { createCycle, nextInCycle, Cycle } from './shuffle-cycle';
import { postScheduledItem } from '../schedule/schedule-runner';
import Logger from '../../utils/Logger';

interface AgentState { cycle: Cycle; poolKey: string; lastAt: number; day: string; postedToday: number; }
const state = new Map<number, AgentState>();

function todayStr(): string { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function hhmm(): string { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/** Quét agent random enabled → đăng 1 bài (nếu tới nhịp). Gọi định kỳ. */
export async function tickRandomAgents(): Promise<void> {
  const db = DatabaseService.getInstance();
  const agents = db.listMcAgents().filter((a: any) => a.enabled && a.type === 'posting' && a.content_source === 'random');
  for (const a of agents) {
    try {
      const sched = (() => { try { return JSON.parse(a.schedule_json || '{}'); } catch { return {}; } })();
      const perDay = Math.max(1, Number(sched.perDay) || 1);
      const winStart = sched.winStart || '00:00';
      const winEnd = sched.winEnd || '23:59';
      const now = hhmm();
      if (now < winStart || now > winEnd) continue; // ngoài khung giờ

      const poolRows = db.listPosts();
      if (!poolRows.length) continue;
      const poolKey = poolRows.map((p: any) => p.id).join(',');

      let st = state.get(a.id);
      if (!st || st.poolKey !== poolKey) { st = { cycle: createCycle(poolRows.map((p: any) => String(p.id))), poolKey, lastAt: 0, day: todayStr(), postedToday: 0 }; state.set(a.id, st); }
      if (st.day !== todayStr()) { st.day = todayStr(); st.postedToday = 0; }
      if (st.postedToday >= perDay) continue;

      // giãn cách tối thiểu = khung giờ / perDay (phút), tối thiểu 1 phút
      const spacingMs = 60_000;
      if (Date.now() - st.lastAt < spacingMs) continue;

      const nx = nextInCycle(st.cycle); st.cycle = nx.cycle;
      if (!nx.id) continue;
      const post = poolRows.find((p: any) => String(p.id) === nx.id);
      if (!post) continue;

      const targets = db.listAgentTargets(a.id).filter((t: any) => t.channel === 'fb' && t.group_id);
      for (const t of targets) {
        const r = await postScheduledItem({ channel: 'fb', account_id: t.account_id, group_id: t.group_id, content: post.content, image_count: post.image_count });
        if (!r.ok) Logger.warn(`[random-pool] agent ${a.id} → ${t.group_id}: ${r.error}`);
      }
      st.lastAt = Date.now(); st.postedToday++;
      Logger.log(`[random-pool] agent ${a.id} đăng bài ${nx.id} (${st.postedToday}/${perDay} hôm nay)`);
    } catch (e: any) { Logger.warn(`[random-pool] agent ${a.id}: ${e?.message}`); }
  }
}

let timer: any = null;
/** Khởi động vòng lặp nền random-pool (mỗi 60s). Gọi 1 lần khi app sẵn sàng. */
export function startRandomPoolRunner(): void {
  if (timer) return;
  timer = setInterval(() => { tickRandomAgents().catch(e => Logger.warn(`[random-pool] ${e?.message}`)); }, 60_000);
  Logger.log('[random-pool] started (60s)');
}
