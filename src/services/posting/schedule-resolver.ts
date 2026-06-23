/**
 * schedule-resolver.ts
 *
 * Pure helpers that turn an agent's schedule rules (daily/weekly/monthly/once)
 * into concrete run-time slots for "today". No Date.now() inside — caller injects nowMs.
 *
 * Time semantics: local device time (Asia/Bangkok = UTC+7 on target machines).
 * weekdays CSV uses 1=Mon..7=Sun. month_days CSV uses 1..31 (clamped to month length).
 */

import { planDailySlots } from './posting-scheduler-service';
import type { AgentSchedule } from '../../models';

export interface ResolvedSlot {
    at: number;          // epoch ms
    scheduleId: number;  // which agent_schedule row produced it
    kind: string;        // daily|weekly|monthly|once
}

const pad = (n: number) => String(n).padStart(2, '0');

function csv(s?: string | null): number[] {
    return (s || '').split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n));
}

function daysInMonth(year: number, monthIdx0: number): number {
    return new Date(year, monthIdx0 + 1, 0).getDate();
}

/** Build epoch ms for "HH:MM" on the calendar day of baseMs. */
function hhmmToMs(hhmm: string, baseMs: number): number {
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    const d = new Date(baseMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0).getTime();
}

/**
 * Resolve all FUTURE slots for today across an agent's rules.
 * - recurring rules contribute `posts_per_day` random times within their window
 * - `once` rules contribute one slot at their date+time, only if date === today
 * Returns slots sorted ascending. Only times strictly after nowMs.
 */
export function resolveSlotsForDay(rules: AgentSchedule[], nowMs: number): ResolvedSlot[] {
    const d = new Date(nowMs);
    const todayIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon..7=Sun
    const dayOfMonth = d.getDate();
    const dim = daysInMonth(d.getFullYear(), d.getMonth());

    const out: ResolvedSlot[] = [];

    for (const r of rules) {
        if (!r.enabled) continue;

        if (r.kind === 'once') {
            if ((r.date || '') === todayIso) {
                const at = hhmmToMs(r.time || r.window_start || '09:00', nowMs);
                if (at > nowMs) out.push({ at, scheduleId: r.id!, kind: 'once' });
            }
            continue;
        }

        let applies = false;
        if (r.kind === 'daily') applies = true;
        else if (r.kind === 'weekly') applies = csv(r.weekdays).includes(dow);
        else if (r.kind === 'monthly') applies = csv(r.month_days).some(day => Math.min(day, dim) === dayOfMonth);

        if (!applies) continue;

        const slots = planDailySlots(r.window_start, r.window_end, r.posts_per_day, nowMs);
        for (const at of slots) out.push({ at, scheduleId: r.id!, kind: r.kind });
    }

    return out.sort((a, b) => a.at - b.at);
}
