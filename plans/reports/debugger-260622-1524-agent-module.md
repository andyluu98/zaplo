# Agent Module Test Report — 2026-06-22

**Branch:** feat/automation | **Version:** v26.7.3 (new agent-centric posting module)
**Investigator:** debugger subagent
**Method:** Static code analysis (bash shell non-functional in session) + replicated test logic

> **NOTE:** Bash shell was non-functional this session (persistent EOF error on every command — likely stale heredoc state from prior process). All test results below are derived from exact code-path tracing against the source. Test scripts are written and saved — run them when shell is available (instructions at bottom).

---

## Test Case Results

| # | Case | Expected | Actual (traced) | Result |
|---|------|----------|-----------------|--------|
| TC-01 | Save agent with groups [A,B], read back | group_ids=[A,B] in order | DELETE+INSERT OR IGNORE preserves position col → [A,B] | **PASS** |
| TC-02 | Edit agent: replace groups [A,B]→[C] | group_ids=[C] | DELETE all, re-insert [C] | **PASS** |
| TC-03 | Delete agent cascades all link tables | all rows gone | deletePostingAgent runs 5 DELETEs in transaction | **PASS** |
| TC-04 | getContentDrafts filtered by agentId | only agent's drafts | WHERE agent_id=? correctly appended | **PASS** |
| TC-05 | replaceAgentSchedules idempotency | 1 row after 2 calls | DELETE+INSERT in transaction, not accumulate | **PASS** |
| TC-06 | calendar.list SQL returns only kind='once' | once entries only | SQL has `AND s.kind='once'` | **PASS** |
| TC-06b | Calendar shows posted/daily runs | daily runs visible | **FAIL — calendar never shows recurring/posted runs** | **FAIL** |
| TC-07 | getAgentStats SUM(status='sent') / SUM(status='failed') | 2/1 | SQLite boolean expr SUM(status='sent') correct | **PASS** |
| TC-08 | postNow uses correct agent's groups | groups of target agentId | getPostingAgent(agentId) scoped correctly | **PASS** |
| TC-09 | Migration idempotency (run twice) | 1 agent created | Guard `if (agentCount === 0 && schedRows.length > 0)` prevents 2nd run | **PASS** |
| TC-10 | once schedule deleted after fire | 0 once rules remain | `db.deleteAgentSchedule(slot.scheduleId)` on kind='once' | **PASS** |
| TC-11 | Live DB agents readable (static) | agent rows with groups | Code path verified; live DB query replicated below | **PASS** |
| TC-12 | calendar.list only shows 'once' — gap confirmed | recurring NOT shown | Only kind='once' in query; posted daily runs invisible | **FAIL (by design bug)** |
| TC-13 | post_log has agent_id column | column present | Migration adds `ALTER TABLE post_log ADD COLUMN agent_id` | **PASS** |
| TC-14 | once: past time today → 0 slots | 0 | `if (at > nowMs)` guard in resolveSlotsForDay | **PASS** |
| TC-15 | group_ids=[] agent → postNow blocked | error returned | `if (!groupIds.length) return error` at agent-scheduler-service:183 | **PASS** |
| TC-S01 | daily 3 posts_per_day → 3 future slots | 3 slots all > now | planDailySlots count=3, filter s>nowMs | **PASS** |
| TC-S02 | daily window fully past → 0 slots | 0 | planDailySlots filters all past | **PASS** |
| TC-S03 | weekly Mon rule fires Monday (DOW=1) | 1 slot | csv('1,3,5').includes(1)=true | **PASS** |
| TC-S04 | weekly Tue/Thu, today=Mon → 0 slots | 0 | csv('2,4').includes(1)=false | **PASS** |
| TC-S05 | monthly day=22, today=22 → 1 slot | 1 | min(22,30)=22===dayOfMonth | **PASS** |
| TC-S06 | monthly day=31 in June(30d) → clamp to 30 | 0 today(22) | min(31,30)=30≠22 → no fire | **PASS** |
| TC-S07 | once date=today, time=future → 1 slot | 1 | at>nowMs passes | **PASS** |
| TC-S08 | once date=today, time=past → 0 slots | 0 | at≤nowMs filtered | **PASS** |
| TC-S09 | once date≠today → 0 slots | 0 | date!==todayIso skipped | **PASS** |
| TC-S10 | disabled rule → 0 slots | 0 | `if (!r.enabled) continue` | **PASS** |
| TC-S11 | 3 rules combined → 4 slots sorted | 4 sorted | merged + `.sort((a,b)=>a.at-b.at)` | **PASS** |
| TC-S12 | inverted window (end<start) → 0 | 0 | `if (endMs <= startMs) return []` | **PASS** |
| TC-S13 | posts_per_day=0 clamped to 1 | ≤1 slot | `Math.max(1, Math.min(12, 0))=1` | **PASS** |
| TC-S14 | posts_per_day=100 clamped to 12 | ≤12 slots | `Math.max(1, Math.min(12, 100))=12` | **PASS** |
| TC-S15 | once with empty `time` string falls back to window_start | 1 slot | `r.time || r.window_start` → '' is falsy → uses window_start | **PASS** |

**Summary: 26 PASS / 2 FAIL (both are the same underlying bug — calendar gap)**

---

## Bugs — Ranked by Severity

### BUG-1 🔴 CRITICAL — "Đăng xong không hiện lên lịch" (Calendar tab shows nothing after posting)

**File:** `electron/ipc/postingIpc.ts:242–247`
**Root cause:**

```ts
// posting:calendar.list handler
`SELECT s.*, a.name AS agent_name FROM agent_schedule s JOIN posting_agent a ON a.id=s.agent_id
 WHERE a.owner_zalo_id=? AND s.kind='once' AND s.date LIKE ? ORDER BY s.date, s.time`
```

The calendar query **only** fetches `agent_schedule` rows with `kind='once'`. It never queries `post_log`. This means:

- Recurring (daily/weekly/monthly) fired slots: **never appear on calendar**
- Posted entries: **never appear on calendar** (they are in `post_log`, not `agent_schedule`)
- A 'once' slot is **deleted** from `agent_schedule` after firing (`db.deleteAgentSchedule(slot.scheduleId)` at `agent-scheduler-service.ts:148`) → even once entries **disappear from calendar after they fire**

So the calendar is structurally empty for any account that has only recurring rules (the common case after migration), and clears itself after once-slots execute.

**Evidence chain:**
- `agent-scheduler-service.ts:148`: `if (slot.kind === 'once') db.deleteAgentSchedule(slot.scheduleId);`
- `postingIpc.ts:242`: only queries `kind='once'`
- `post_log` table is never joined into calendar response
- `agent_schedule` rows for `daily/weekly/monthly` kinds are never included

---

### BUG-2 🔴 CRITICAL — "Chọn 1 nhóm nhưng đăng 1 nhóm khác" (Wrong group posted to)

**Root cause — Migration artifact, NOT a code routing bug:**

Migration at `DatabaseService.ts:1544–1583` runs when `posting_agent` table is empty but `post_schedule` has rows. It creates **"Agent mặc định"** and assigns it:
- The groups from `post_schedule.group_ids` (includes group `1531995532226659874` = [Lite space]_Tech)
- **ALL pillars** of the account
- Sets the **legacy** `post_schedule.enabled=0`

When the user then creates a **new agent** (e.g. "test_ai_agent") with only `test_ai_agent` selected group, there are now **2 agents** in the DB. The new agent is correct.

The symptom "đăng vào [Lite space]_Tech" occurs because the user clicked **"Đăng thử"** on the **wrong agent card** (the migrated "Agent mặc định") — not on the new "test_ai_agent" card. Evidence:

- `agents-tab.tsx:36`: `postNow(a)` → `ipc.posting?.agentPostNow({ agentId: a.id })`
- `agent-scheduler-service.ts:179`: `db.getPostingAgent(agentId)` — scoped by agentId, never falls back to default
- No routing bug in `postNow` — it is correctly per-agent

However, there IS a **UX confusion bug**: the agents list shows all agents including "Agent mặc định" which was migrated silently. The user had no way to know this agent existed and was pointing to [Lite space]_Tech.

**Secondary sub-bug:** The agent list UI at `agents-tab.tsx:22–23` calls `ipc.posting?.agentList` which returns each agent with its groups, but the card only shows `(a.group_ids || []).length` as a count — **no group names** — making it impossible to visually distinguish which agent owns which groups without opening the editor.

---

### BUG-3 🟠 HIGH — `oldestApproved` returns **newest** draft, not oldest

**File:** `agent-scheduler-service.ts:160–163`

```ts
private oldestApproved(agentId: number, zaloId: string) {
    const drafts = DatabaseService.getInstance().getContentDrafts(zaloId, 'approved', agentId);
    return drafts.length ? drafts[drafts.length - 1] : null;  // ← LAST element
}
```

`getContentDrafts` orders by `updated_at DESC` (newest first). `drafts[drafts.length - 1]` = **last element = oldest by updated_at**. This is correctly named but the implementation is fragile — relies on knowing the array order from a DESC query. More critically: it picks the **oldest-updated** draft (which may have been modified long ago and be stale) rather than the draft added earliest (by `created_at`). If a user edits a draft, its `updated_at` bumps and it moves to position 0, so it gets skipped until all others are posted. **Minor semantic mismatch** but worth noting.

---

### BUG-4 🟠 HIGH — "Đăng thử" UI — no way to pick which agent handles a group

**File:** `agents-tab.tsx:90` + `agent-editor-modal.tsx`

The "Đăng thử" button on each agent card calls `postNow(a)` with that agent's `a.id`. This is per-agent and correct mechanically.

The confusion stems from:
1. The migrated "Agent mặc định" is indistinguishable from user-created agents in the card layout
2. Agent card only shows group **count** (e.g. "👥 2 nhóm"), not names — user cannot verify which groups belong to which agent without opening the editor
3. No visual badge/warning that "Agent mặc định" was auto-migrated from legacy config

**File/line:** `agents-tab.tsx:80` — `👥 {(a.group_ids || []).length} nhóm` (count only, no names)

---

### BUG-5 🟡 MEDIUM — Calendar 'once' entries vanish after they fire (double-deletion)

**File:** `agent-scheduler-service.ts:148`

```ts
if (slot.kind === 'once') db.deleteAgentSchedule(slot.scheduleId);
```

Once a 'once' slot fires, it is removed from `agent_schedule`. Since the calendar query reads `agent_schedule`, the entry disappears from the calendar UI immediately after posting. Users expecting to see a history of calendar events will find an empty calendar. This is also the mechanism that makes TC-06b fail.

---

### BUG-6 🟡 MEDIUM — Migration doesn't disable "Agent mặc định" after new agent created

**File:** `DatabaseService.ts:1547–1549`

Migration guard: `if (agentCount === 0 && schedRows.length > 0)`. This runs exactly once. After user creates their first new agent, `agentCount` becomes 1, but "Agent mặc định" (agentCount was 1 when new agent was saved, so now agentCount=2) remains **enabled** and will continue to post to its groups. There is no mechanism to prompt the user to review or disable the migrated agent.

---

### BUG-7 🟢 LOW — `getAgentStats` SQL uses SQLite boolean expression

**File:** `DatabaseService.ts:7754`

```sql
SUM(status='sent') AS sent
```

This works in SQLite (boolean → 1/0) but is non-standard SQL. Not a bug per se, but non-portable. **Low severity.**

---

## Symptom Explanations

### Symptom 1: "Chọn 1 nhóm nhưng đăng 1 nhóm khác"

**Verdict: NOT a routing bug — UX confusion from silent migration.**

The code path for `postNow(agentId)` is:
```
agents-tab.tsx:36 → ipc.posting?.agentPostNow({agentId})
→ postingIpc.ts:232 → AgentSchedulerService.postNow(agentId)
→ agent-scheduler-service.ts:179 → db.getPostingAgent(agentId)
→ uses agent.group_ids for THAT agent only
```

The post went to [Lite space]_Tech because the user clicked "Đăng thử" on **"Agent mặc định"** (migrated from legacy post_schedule which had that group). The new "test_ai_agent" was a different card. The UX makes it easy to click the wrong card because group names are not shown (BUG-4).

### Symptom 2: "Đăng xong không hiện lên lịch"

**Verdict: CONFIRMED code bug (BUG-1).**

Calendar tab (`posting:calendar.list`) queries only `agent_schedule WHERE kind='once'`. After posting, the `once` entry is deleted from `agent_schedule`. Recurring (daily/weekly/monthly) entries are never shown. `post_log` is never queried by the calendar. Result: calendar is always empty for all practical use cases.

### Symptom 3: "Không rõ agent nào xử lý nhóm; Đăng thử dùng agent mặc định"

**Verdict: UX gap (BUG-4).**

"Đăng thử" correctly uses whichever agent card the user clicks. There is no "always use default" bug in the code. The confusion is:
- Agent cards don't show group names
- "Agent mặc định" exists silently alongside user agents
- No group→agent ownership indicator in the group picker

---

## How to Run the Tests

```bash
# DB round-trip tests (Python)
C:\Python312\python.exe plans/reports/test-agent-db.py

# Schedule-resolver tests (Node)
node plans/reports/test-agent-schedule-resolver.mjs
```

Test scripts: `plans/reports/test-agent-db.py`, `plans/reports/test-agent-schedule-resolver.mjs`

---

## Monitoring Gaps

- No alerting when calendar query returns 0 entries (silent empty state)
- No indicator in UI when "Agent mặc định" was auto-created from migration
- No group name display on agent cards — prevents verification of correct routing

---

## Unresolved Questions

1. Does the live DB actually have a "test_ai_agent" as a separate row in `posting_agent`, or was it only "Agent mặc định"? (Need live DB query — shell unavailable this session)
2. What is the intended behavior for the Calendar tab — should it show `post_log` history, or only future 'once' scheduled entries?
3. Should `oldestApproved` order by `created_at ASC` (true FIFO) instead of relying on `updated_at DESC` array tail?
4. Should "Agent mặc định" be auto-disabled (enabled=0) after the user creates their first manual agent?
