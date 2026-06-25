/**
 * schedule-ipc.ts
 * IPC Lịch nội dung: liệt kê theo khoảng, rải bài (sinh item), xóa, chạy-tới-hạn-ngay.
 */
import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import { spreadPosts, datesBetween } from '../../src/services/schedule/spread-posts';
import { runDueSchedule } from '../../src/services/schedule/schedule-runner';

export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:range', async (_e, { from, to }: { from: number; to: number }) => {
    try { return { success: true, items: DatabaseService.getInstance().listScheduleRange(from, to) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  // Rải bài: spread (post × ngày × slot) rồi nhân với từng target (account+group).
  ipcMain.handle('schedule:spread', async (_e, p: {
    postIds: string[]; fromDate: string; toDate: string; perDay: number; times: string[];
    targets: Array<{ channel: string; accountId: string; groupId: string }>;
  }) => {
    try {
      const dates = datesBetween(p.fromDate, p.toDate);
      const spread = spreadPosts(p.postIds.map(String), dates, p.perDay, p.times);
      const items = spread.flatMap(s => p.targets.map(t => ({
        post_id: Number(s.postId),
        channel: t.channel,
        account_id: t.accountId,
        group_id: t.groupId,
        scheduled_at: new Date(`${s.date}T${s.time}:00`).getTime(),
      })));
      DatabaseService.getInstance().addScheduleItems(items);
      return { success: true, count: items.length };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('schedule:delete', async (_e, { id }: { id: number }) => {
    try { DatabaseService.getInstance().deleteScheduleItem(id); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('schedule:runDueNow', async () => {
    try { return { success: true, ...(await runDueSchedule()) }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });
}
