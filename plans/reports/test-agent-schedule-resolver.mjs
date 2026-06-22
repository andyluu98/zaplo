/**
 * Schedule-resolver unit tests — pure JS, no imports.
 * Run: node plans/reports/test-agent-schedule-resolver.mjs
 *
 * Replicates planDailySlots + resolveSlotsForDay exactly from source:
 *   src/services/posting/posting-scheduler-service.ts (planDailySlots)
 *   src/services/posting/schedule-resolver.ts         (resolveSlotsForDay)
 */

// ── Replicated pure helpers ─────────────────────────────────────────────────

const MAX_POSTS_PER_DAY = 12;

function planDailySlots(windowStart, windowEnd, postsPerDay, nowMs) {
    const parseHHMM = (hhmm, baseMs) => {
        const [hh, mm] = hhmm.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return baseMs;
        const d = new Date(baseMs);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
    };
    const startMs = parseHHMM(windowStart, nowMs);
    const endMs   = parseHHMM(windowEnd, nowMs);
    if (endMs <= startMs) return [];
    const count = Math.max(1, Math.min(MAX_POSTS_PER_DAY, postsPerDay));
    const slots = [];
    for (let i = 0; i < count; i++) {
        const slot = startMs + Math.random() * (endMs - startMs);
        slots.push(Math.floor(slot));
    }
    return slots.sort((a, b) => a - b).filter(s => s > nowMs);
}

const pad = (n) => String(n).padStart(2, '0');

function csv(s) {
    return (s || '').split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n));
}

function daysInMonth(year, monthIdx0) {
    return new Date(year, monthIdx0 + 1, 0).getDate();
}

function hhmmToMs(hhmm, baseMs) {
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    const d = new Date(baseMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                    isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0).getTime();
}

function resolveSlotsForDay(rules, nowMs) {
    const d = new Date(nowMs);
    const todayIso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon..7=Sun
    const dayOfMonth = d.getDate();
    const dim = daysInMonth(d.getFullYear(), d.getMonth());

    const out = [];
    for (const r of rules) {
        if (!r.enabled) continue;

        if (r.kind === 'once') {
            if ((r.date || '') === todayIso) {
                const at = hhmmToMs(r.time || r.window_start || '09:00', nowMs);
                if (at > nowMs) out.push({ at, scheduleId: r.id, kind: 'once' });
            }
            continue;
        }

        let applies = false;
        if (r.kind === 'daily') applies = true;
        else if (r.kind === 'weekly') applies = csv(r.weekdays).includes(dow);
        else if (r.kind === 'monthly') applies = csv(r.month_days).some(day => Math.min(day, dim) === dayOfMonth);

        if (!applies) continue;

        const slots = planDailySlots(r.window_start, r.window_end, r.posts_per_day, nowMs);
        for (const at of slots) out.push({ at, scheduleId: r.id, kind: r.kind });
    }

    return out.sort((a, b) => a.at - b.at);
}

// ── Test harness ──────────────────────────────────────────────────────────────

const results = [];
function ok(name)         { results.push({r:'PASS',name}); console.log(`  PASS  ${name}`); }
function fail(name, why)  { results.push({r:'FAIL',name}); console.log(`  FAIL  ${name} — ${why}`); }

// Fixed "now": 2026-06-22 Monday 08:30 local (UTC+7 → UTC 01:30)
// We build this as a local-time epoch so tests are timezone-agnostic on the machine.
const NOW = new Date(2026, 5, 22, 8, 30, 0, 0).getTime(); // 5=June (0-indexed), day 22

// Helper: build an ISO date string for the machine's local "today" of NOW
const nowD = new Date(NOW);
const TODAY = `${nowD.getFullYear()}-${pad(nowD.getMonth()+1)}-${pad(nowD.getDate())}`;
const DOW   = nowD.getDay() === 0 ? 7 : nowD.getDay(); // should be 1 = Monday

console.log(`\nFixed NOW: ${nowD.toLocaleString()} (local), TODAY=${TODAY}, DOW=${DOW}`);

// ── TC-S01  daily rule: generates posts_per_day slots, all > nowMs ────────────
console.log('\n── TC-S01  daily rule generates correct slot count ────────────────────');
{
    const rules = [{ id:1, enabled:1, kind:'daily', window_start:'09:00', window_end:'21:00', posts_per_day:3 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 3) ok('TC-S01 daily 3 posts_per_day → 3 slots');
    else fail('TC-S01 daily slot count', `expected 3 got ${slots.length}`);
    const allFuture = slots.every(s => s.at > NOW);
    if (allFuture) ok('TC-S01 all slots strictly after nowMs');
    else fail('TC-S01 slots in future', `some at <= NOW: ${JSON.stringify(slots)}`);
}

// ── TC-S02  daily rule: window already passed → 0 slots ──────────────────────
console.log('\n── TC-S02  daily rule, window already passed → 0 slots ───────────────');
{
    // NOW = 08:30; window 07:00–08:00 is fully in past
    const rules = [{ id:2, enabled:1, kind:'daily', window_start:'07:00', window_end:'08:00', posts_per_day:2 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 0) ok('TC-S02 past window yields 0 slots');
    else fail('TC-S02 past window', `expected 0 got ${slots.length}`);
}

// ── TC-S03  weekly rule: today is Monday (DOW=1); weekdays includes 1 → fires ─
console.log('\n── TC-S03  weekly rule fires on correct weekday ───────────────────────');
{
    const rules = [{ id:3, enabled:1, kind:'weekly', weekdays:'1,3,5', window_start:'09:00', window_end:'21:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 1) ok('TC-S03 weekly Mon rule fires on Monday');
    else fail('TC-S03 weekly Mon', `expected 1 got ${slots.length}`);
}

// ── TC-S04  weekly rule: today is Monday; weekdays is Tue,Thu → doesn't fire ──
console.log('\n── TC-S04  weekly rule skips wrong weekday ────────────────────────────');
{
    const rules = [{ id:4, enabled:1, kind:'weekly', weekdays:'2,4', window_start:'09:00', window_end:'21:00', posts_per_day:2 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 0) ok('TC-S04 weekly Tue/Thu skipped on Monday');
    else fail('TC-S04 weekly wrong day', `expected 0 got ${slots.length}`);
}

// ── TC-S05  monthly rule: day=22 is today → fires ────────────────────────────
console.log('\n── TC-S05  monthly rule fires on correct month_day ────────────────────');
{
    const rules = [{ id:5, enabled:1, kind:'monthly', month_days:'15,22', window_start:'09:00', window_end:'21:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 1) ok('TC-S05 monthly day=22 fires today');
    else fail('TC-S05 monthly day=22', `expected 1 got ${slots.length}`);
}

// ── TC-S06  monthly rule: day=31 in June (30 days) → clamped to 30 ───────────
console.log('\n── TC-S06  monthly rule clamps day>month-length ───────────────────────');
{
    // June has 30 days. day=31 should clamp to 30. TODAY=22, so clamped 30 != 22 → no fire.
    const rules = [{ id:6, enabled:1, kind:'monthly', month_days:'31', window_start:'09:00', window_end:'21:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    // day=22 today; min(31,30)=30 != 22 → no fire
    if (slots.length === 0) ok('TC-S06 day=31 in June (30d): clamped to 30 → no fire today (day 22)');
    else fail('TC-S06 clamp day>dim', `expected 0 got ${slots.length}`);
}

// ── TC-S07  once: date=today, time=future → 1 slot ──────────────────────────
console.log('\n── TC-S07  once rule fires when date=today and time is future ─────────');
{
    const rules = [{ id:7, enabled:1, kind:'once', date:TODAY, time:'15:00', window_start:'15:00', window_end:'15:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 1 && slots[0].kind === 'once') ok('TC-S07 once today future time → 1 slot');
    else fail('TC-S07 once today', `expected 1 got ${slots.length}`);
}

// ── TC-S08  once: date=today, time=past → 0 slots ───────────────────────────
console.log('\n── TC-S08  once rule past time today → 0 slots ────────────────────────');
{
    const rules = [{ id:8, enabled:1, kind:'once', date:TODAY, time:'07:00', window_start:'07:00', window_end:'07:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 0) ok('TC-S08 once today past time → 0 slots');
    else fail('TC-S08 once past', `expected 0 got ${slots.length}`);
}

// ── TC-S09  once: date=other day → 0 slots ──────────────────────────────────
console.log('\n── TC-S09  once rule different date → 0 slots ─────────────────────────');
{
    const rules = [{ id:9, enabled:1, kind:'once', date:'2026-07-01', time:'10:00', window_start:'10:00', window_end:'10:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 0) ok('TC-S09 once different date → 0 slots');
    else fail('TC-S09 once wrong date', `expected 0 got ${slots.length}`);
}

// ── TC-S10  disabled rule → 0 slots ─────────────────────────────────────────
console.log('\n── TC-S10  disabled rule → 0 slots ────────────────────────────────────');
{
    const rules = [{ id:10, enabled:0, kind:'daily', window_start:'09:00', window_end:'21:00', posts_per_day:2 }];
    const slots = resolveSlotsForDay(rules, NOW);
    if (slots.length === 0) ok('TC-S10 disabled rule skipped');
    else fail('TC-S10 disabled', `expected 0 got ${slots.length}`);
}

// ── TC-S11  multiple rules combined → slots merged + sorted ─────────────────
console.log('\n── TC-S11  multiple rules merged and sorted ascending ─────────────────');
{
    const rules = [
        { id:11, enabled:1, kind:'daily',   window_start:'09:00', window_end:'12:00', posts_per_day:2 },
        { id:12, enabled:1, kind:'weekly',  weekdays:`${DOW}`, window_start:'14:00', window_end:'17:00', posts_per_day:1 },
        { id:13, enabled:1, kind:'once',    date:TODAY, time:'18:00', window_start:'18:00', window_end:'18:00', posts_per_day:1 },
    ];
    const slots = resolveSlotsForDay(rules, NOW);
    // 2 daily + 1 weekly + 1 once = 4 (if all windows still in future)
    if (slots.length === 4) ok(`TC-S11 4 combined slots`);
    else fail('TC-S11 combined count', `expected 4 got ${slots.length} — ${JSON.stringify(slots.map(s=>new Date(s.at).toLocaleTimeString()))}`);
    const sorted = slots.every((s,i) => i === 0 || s.at >= slots[i-1].at);
    if (sorted) ok('TC-S11 slots sorted ascending');
    else fail('TC-S11 sort', 'slots not sorted');
}

// ── TC-S12  planDailySlots: window_end <= window_start → [] ─────────────────
console.log('\n── TC-S12  planDailySlots inverted window returns empty ───────────────');
{
    const slots = planDailySlots('21:00', '09:00', 3, NOW);
    if (slots.length === 0) ok('TC-S12 inverted window → 0 slots');
    else fail('TC-S12 inverted window', `expected 0 got ${slots.length}`);
}

// ── TC-S13  planDailySlots: posts_per_day=0 clamped to 1 ────────────────────
console.log('\n── TC-S13  planDailySlots posts_per_day=0 clamped to 1 ───────────────');
{
    const slots = planDailySlots('09:00', '21:00', 0, NOW);
    // count = Math.max(1, Math.min(12, 0)) = 1
    if (slots.length <= 1) ok('TC-S13 posts_per_day=0 clamped → ≤1 slot');
    else fail('TC-S13 clamp min', `expected ≤1 got ${slots.length}`);
}

// ── TC-S14  planDailySlots: posts_per_day=100 clamped to 12 ─────────────────
console.log('\n── TC-S14  planDailySlots posts_per_day=100 clamped to MAX(12) ────────');
{
    const slots = planDailySlots('00:00', '23:59', 100, NOW);
    if (slots.length <= 12) ok(`TC-S14 clamped to max ${slots.length} slots`);
    else fail('TC-S14 clamp max', `expected ≤12 got ${slots.length}`);
}

// ── TC-S15  BUG PROBE: once time field vs window_start fallback ──────────────
// In resolveSlotsForDay for once: uses r.time || r.window_start || '09:00'
// In agent-editor-modal line 77: once entry stored as
//   { kind:'once', date, time: o.time, window_start: o.time, ... }
// So both r.time and r.window_start are the same value — no bug here.
// BUT: in agent-editor-modal line 59 (loading):
//   time: s.time || s.window_start
// If s.time is empty string '' (from DB default), this falls to window_start.
// The DB default for time col is '' (empty string). An empty string is falsy in JS.
// Test: empty string time → should use window_start correctly.
console.log('\n── TC-S15  once with empty time string falls back to window_start ─────');
{
    const rules = [{ id:15, enabled:1, kind:'once', date:TODAY, time:'', window_start:'14:00', posts_per_day:1 }];
    const slots = resolveSlotsForDay(rules, NOW);
    // hhmmToMs('14:00', NOW) > NOW (08:30) → should fire
    if (slots.length === 1) ok('TC-S15 empty time falls back to window_start correctly');
    else fail('TC-S15 empty time fallback', `expected 1 got ${slots.length}`);
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
const passed = results.filter(r => r.r === 'PASS').length;
const failed = results.filter(r => r.r === 'FAIL').length;
console.log(`TOTAL: ${passed} PASS / ${failed} FAIL out of ${results.length}`);
if (failed > 0) {
    console.log('FAILED:');
    results.filter(r => r.r === 'FAIL').forEach(r => console.log(`  - ${r.name}`));
    process.exit(1);
} else {
    process.exit(0);
}
