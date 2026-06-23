# UX Redesign Spec — Posting Module (agent-centric)
**Date:** 2026-06-22 | **Branch:** feat/automation | **Author:** ux-spec agent

---

## 0. Summary of Current Pain

| Problem | Root cause in code |
|---|---|
| "Đăng thử" from AgentsTab calls `agentPostNow` with no confirmation of which groups | No target preview before posting |
| Calendar shows only `kind=once` entries; recurring pattern invisible | `calendarList` only returns once-type schedule rows |
| "Bài đăng" has no agent/group column; user can't tell which draft belongs to which agent | `ContentDraft.agent_id` exists in model but is never rendered |
| "Chủ đề" and "Thư viện ảnh" are top-level tabs but are secondary configuration inputs | Information architecture problem — they're agent config, not primary workflow |
| Stats: 3 flat KPI numbers + 1 bar chart, no time axis, no success rate | `ipc.posting.stats` only returns `{sent, failed}` total per agent |
| "Agent mặc định" confusion after migration | No onboarding empty-state; migrated agents appear identical to user-created ones |

---

## 1. Information Architecture

### Decision: 4 primary tabs + 1 Settings panel inside Agent editor

Current 6 tabs have two structural problems:
1. "Chủ đề" and "Thư viện ảnh" are *inputs to agents*, not primary workflows. Users should configure them while setting up an agent, not navigate away to a separate tab mid-flow.
2. "Bài đăng" (drafts queue) and "Thống kê" are the primary *output* views. They belong at top-level and need agent-aware filtering.

**Proposed tab set (4 tabs, left to right):**

```
🤖 Agents   |   📝 Bài đăng   |   📅 Lịch   |   📊 Thống kê
```

**What moves where:**

- `Chủ đề` → becomes a secondary panel inside the Agent editor modal (right column), tab-switched: "Nhóm & Chủ đề" | "Lịch" | "Ảnh & Duyệt". Can also open standalone as `AgentResourcesDrawer` from a link in Agents tab header ("Quản lý chủ đề / thư viện").
- `Thư viện ảnh` → same: accessible from AgentEditorModal → "Ảnh & Duyệt" tab, plus a small "Mở thư viện ảnh ↗" link from that panel that opens `ImageLibraryDrawer` (slide-in panel, not a full tab).
- This reduces cognitive overhead: user sets up an agent → all config is in one modal → comes back to primary tabs for actual work.

---

## 2. Per-Tab Concrete Improvements

### 2.1 Tab: Agents (`agents-tab.tsx`)

**Layout: 2 changes**

**A. Agent card — clarify who-posts-where**

Current info line: `🔑 Trợ lý riêng · 🧩 2 chủ đề · 👥 3 nhóm`
→ Show actual group names in a collapsed chip row (max 3 chips, then "+N").

```
Component: AgentGroupChips
<div className="flex flex-wrap gap-1 mt-1.5">
  {groupNames.slice(0, 3).map(n => (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">{n}</span>
  ))}
  {groupNames.length > 3 && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500">+{groupNames.length - 3}</span>
  )}
</div>
```

Data available: `agent.group_ids[]` + `groupsList` (already loaded in AgentEditorModal, needs to be passed or cached in store).

**B. "Đăng thử" button — fix ambiguity**

Current: "⚡ Đăng thử" fires `agentPostNow` immediately, no target confirmation.
→ Rename to "⚡ Đăng ngay" and show a **confirmation popover** (not full modal) listing: "Sẽ đăng tới: GroupA, GroupB, GroupC — tiếp tục?" with a small preview of the oldest approved draft text (first 80 chars).

```
Component: PostNowConfirmPopover
Trigger: button "⚡ Đăng ngay"
Popover content (absolute positioned below button, z-20):
  - List of group names (agent.group_ids resolved to names)
  - Draft preview: oldest approved draft text, 80 chars + "…"
  - If no approved draft + approval_mode=manual: show warning "Chưa có bài đã duyệt"
  - Buttons: [Hủy] [Đăng {N} nhóm →]
```

Data needed: group names for the agent (needs `groupsList` cached in store — currently loaded only inside AgentEditorModal). **New requirement**: cache groupsList in `posting-store` so AgentsTab can render group names without loading the full editor. Add to store: `allGroups: ZaloGroup[]` + `setAllGroups`. Fetch once on tab mount via `ipc.posting.groupsList`.

**C. "Agent mặc định" confusion — onboarding state**

If any agent's name is literally "Agent mặc định" AND it has mismatched config (e.g. pillar_ids=[] or group_ids=[]), render a special **migration banner** at the top of the card:

```
Component: MigratedAgentBanner (inside agent card, only when name==="Agent mặc định")
<div className="mt-2 bg-amber-900/15 border border-amber-700/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
  ⚠ Agent này được tạo tự động khi nâng cấp.
  Bấm [Sửa →] để đặt tên, chọn nhóm và chủ đề phù hợp.
</div>
```

Additionally, full empty-state (no agents at all) should show onboarding card with 3-step explanation:
```
Component: AgentsOnboardingCard
Step 1: Chọn nhóm Zalo muốn đăng → tên agent
Step 2: Gán chủ đề (AI sẽ viết bài theo đó)
Step 3: Đặt lịch → bật agent → AI tự đăng
[+ Tạo Agent đầu tiên] (large CTA)
```

---

### 2.2 Tab: Bài đăng (`drafts-tab.tsx`)

**Biggest UX gap: drafts show no agent, no groups, no when-posted.**

**A. Add agent column + group column to DraftCard**

`ContentDraft.agent_id` is in the model. Resolve it to agent name. Also, after posting, `PostLog` has the `group_id` of where it was sent.

```
DraftCard header row (between status badge and AI badge):
<span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">
  {agentName || '—'}
</span>
```

For `posted` status drafts, add a sub-row:
```
<div className="text-[10px] text-gray-600 mt-1">
  Đã đăng {fmtRelativeTime(postedAt)} → {groupName || groupId}
</div>
```

Data needed:
- Agent name: derive from agent list already available in component (pass agents list as prop or read from store)
- PostLog with `draft_id` matching this draft's id: **new IPC** `ipc.posting.logByDraftId({ zaloId, draftId })` → `{ logs: PostLog[] }`. Alternative (cheaper): include in `draftList` response a joined `last_posted_at` and `last_posted_group_id`. Recommend the joined approach: modify `draftList` IPC to return extra fields `posted_at_ms` and `posted_group_ids` (array).

**B. Agent filter**

Add an agent filter dropdown above the status filter row:

```
Component: AgentFilterBar (above status pills)
<select className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-xs text-gray-300">
  <option value="">Tất cả agents</option>
  {agents.map(a => <option value={a.id}>{a.name}</option>)}
</select>
```

Pass `agentId` filter to `ipc.posting.draftList({ zaloId, agentId, status })`.
**New IPC param**: `agentId` on `draftList` (optional, already has agent_id on drafts table, just add WHERE clause in query).

**C. "Đăng thử ngay" — fix scope confusion**

Current: `botPostNow({ zaloId, draftId })` — this posts to ALL groups of ALL agents for this zaloId, which is confusing.
→ Rename to "⚡ Đăng bài này" when 1 draft is checked. Show agent + groups in confirm popover before firing.
→ If no draft is selected, hide this button entirely (or ghost it with tooltip "Chọn 1 bài để đăng thử").

**D. Generate bar — add agent picker**

Currently generates drafts for a pillar with no agent attached.
→ Add agent picker before pillar picker:
```
Agent: [dropdown]  Chủ đề: [dropdown]  Số bài: [3]  [Sinh bài AI]
```
This sets `agent_id` on generated drafts so they show up in per-agent filter.
**New IPC param**: `agentId` on `draftGenerate` (optional).

---

### 2.3 Tab: Lịch (`calendar-tab.tsx`)

**Core problem: only shows `once` calendar entries. Recurring schedules and posted history are invisible.**

**Redesign: 3 layers of data on the calendar grid**

```
Layer 1 (dots): once-entries (existing, amber dots)
Layer 2 (dots): posted history from PostLog for that day (green dots)
Layer 3 (dots): projected recurring posts for future days (blue dots, faded)
```

**Day cell redesign:**

```
Component: CalendarDayCell
<div className="min-h-[68px] rounded-lg border p-1.5 cursor-pointer ...">
  <b>{d}</b>
  <div className="mt-1 flex flex-col gap-0.5">
    {/* Posted events (green) */}
    {postedLogs.map(l => (
      <div className="text-[9px] text-green-400 truncate">✓ {l.agentName}</div>
    ))}
    {/* Scheduled once entries (amber) */}
    {onceEntries.map(e => (
      <div className="text-[9px] text-amber-400 truncate">📅 {e.agentName}</div>
    ))}
    {/* Projected recurring (blue, future only) */}
    {projected.map(p => (
      <div className="text-[9px] text-blue-500/60 truncate">● {p.agentName}</div>
    ))}
  </div>
</div>
```

**Legend bar** below month nav:
```
<div className="flex items-center gap-4 text-[10px] text-gray-500">
  <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"/>Đã đăng</span>
  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"/>Mốc lịch</span>
  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500/50 mr-1"/>Dự kiến</span>
</div>
```

**Day detail panel** (click a day):

```
Component: CalendarDayDetail
Sections:
  [Đã đăng hôm {d}/{m}]
    - Per log: agentName · groupName · "Đã gửi" badge · time · draft text preview (60 chars)
  [Mốc calendar]
    - existing once entries (unchanged)
  [Dự kiến (recurring)]
    - show which agents have recurring schedule firing on this day
    - "xem cấu hình →" link opens AgentEditorModal for that agent
```

**New IPC needed:**
- `ipc.posting.logList({ zaloId, dateYMD })` → `{ logs: PostLog[] }` with joined `agent_name`, `group_name`, `draft_text_preview`.
- OR: extend `calendarList` to return both once-entries AND log-entries in one call, differentiated by `type: 'once' | 'posted'`.
- Projected recurring: compute client-side from agent schedules already in agents list (no new IPC needed — agent.schedules is loaded).

---

### 2.4 Tab: Thống kê (`stats-tab.tsx`)

**Complete redesign — current is 3 KPI cards + 1 flat bar chart.**

**Target layout (all CSS/SVG, no chart lib):**

```
┌─────────────────────────────────────────────────┐
│  KPI Row (4 cards)                              │
│  [Tổng đã đăng] [Tỉ lệ thành công] [Agents]   │
│  [Bài chờ duyệt]                                │
├──────────────────┬──────────────────────────────┤
│  Per-agent bars  │  Activity feed (last 10)     │
│  (left 55%)      │  (right 45%)                │
└──────────────────┴──────────────────────────────┘
```

**KPI Cards — 4 cards, 2×2 grid on mobile, 4-col on desktop:**

```
Component: StatsKpiCard
Props: value, label, color, trend? (optional "+N từ tuần trước")
Colors: green-400 (sent), blue-400 (success%), amber-400 (agents), purple-400 (pending)

Cards:
1. Tổng đã đăng — totalSent — text-green-400
2. Tỉ lệ thành công — `Math.round(totalSent/(totalSent+totalFail)*100)%` — text-blue-400
   (show "100%" with green if no fails; show "—" if no data)
3. Agent đang chạy — count of agents with enabled=1 — text-amber-400
4. Bài chờ duyệt — sum of pendingDrafts across agents — text-purple-400
```

**Per-agent bar chart — horizontal bars with 2 series:**

```
Component: AgentBarChart
Each row:
  [agent name, max-w-36, truncate]
  [bar track, flex-1, h-4, bg-gray-900, rounded]
    [green fill: sent/max * 100%]
    [red fill for failed, stacked right via absolute]
  [N gửi · N lỗi, text-xs, text-right, w-24]

Add: time range filter pill row above chart:
  [Hôm nay] [7 ngày] [30 ngày] [Tất cả]
  → passes `period` param to stats IPC
```

**Activity feed — last 10 log entries:**

```
Component: RecentActivityFeed
Each item:
  <div className="flex items-center gap-2 py-1.5 border-b border-gray-800">
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status==='sent' ? 'bg-green-500' : 'bg-red-500'}`}/>
    <span className="text-xs text-gray-400 flex-1 truncate">{agentName} → {groupName}</span>
    <span className="text-[10px] text-gray-600 flex-shrink-0">{relTime}</span>
  </div>

Empty state: "Chưa có lịch sử đăng bài nào."
```

**New IPC needed:**
- `ipc.posting.stats({ zaloId, period: 'today'|'7d'|'30d'|'all' })` — add `period` param (currently none). Backend filters `PostLog.posted_at`.
- `ipc.posting.logList({ zaloId, limit: 10 })` → recent logs with joined agent_name, group_name — for activity feed. (May already exist as `log.list` per prompt context; confirm shape.)
- `pendingDrafts` per agent: already on `agent.status.pendingDrafts` from `agentList` response — no new IPC.

---

## 3. Agent mặc định — Full Fix

**Three-part fix:**

**Part 1: Migration banner on the card** (described in §2.1C above)
Detection: `agent.name === 'Agent mặc định' && (agent.pillar_ids?.length === 0 || agent.group_ids?.length === 0)`

**Part 2: First-run onboarding overlay**
When `agents.length === 1 && agents[0].name === 'Agent mặc định'`, show a full-tab onboarding card instead of the normal card grid. This card has:

```
Component: FirstRunOnboardingCard
- Heading: "Chào mừng đến với Đăng bài tự động!"
- Subtext: "Một agent mặc định đã được tạo sẵn. Hãy cấu hình nó để bắt đầu."
- 3 checklist steps with visual progress:
  [ ] 1. Đặt tên agent & chọn nhóm Zalo
  [ ] 2. Thêm chủ đề nội dung (AI sẽ viết theo đó)
  [ ] 3. Đặt lịch → bật agent
- Large CTA: "Cấu hình Agent mặc định →" → opens AgentEditorModal for that agent
- Secondary link: "Tạo agent mới thay thế"
```

**Part 3: Agent editor validation**
In `AgentEditorModal`, on save: if name is blank or "Agent" (the current default), show inline warning:
```
"Tên agent nên mô tả mục đích (VD: Agent BĐS — LMak). Tiếp tục?"
```
Not a blocking error, just a soft prompt.

---

## 4. Data Available vs. New IPC Needed

| Feature | Data Available | New IPC / Change Needed |
|---|---|---|
| Group names on agent card | `ipc.posting.groupsList` (exists) | Cache `allGroups` in posting-store; fetch on AgentsTab mount |
| Đăng ngay confirmation popover | `agent.group_ids`, `allGroups`, oldest approved draft | None — client-side using existing data |
| Draft agent column | `ContentDraft.agent_id` (exists in model) | None — just render it; need agents list in DraftsTab |
| Draft agent filter | `draftList` IPC | Add optional `agentId` param to `draftList` query |
| Draft posted-where info | `PostLog.draft_id` + `PostLog.group_id` (exists) | Extend `draftList` response to JOIN last post log; new fields: `posted_at_ms`, `posted_group_ids` |
| Draft generate with agent_id | `draftGenerate` IPC | Add optional `agentId` param to `draftGenerate` |
| Calendar posted history | `PostLog.posted_at` (exists) | New IPC `logList({ zaloId, ym })` or extend `calendarList` to return logs |
| Calendar projected recurring | `agent.schedules` (already in agentList) | None — compute client-side |
| Stats period filter | `ipc.posting.stats` | Add `period` param: `'today'|'7d'|'30d'|'all'` |
| Stats activity feed | `PostLog` table | New IPC `logList({ zaloId, limit })` with joined agent_name, group_name |
| Stats success rate | `sent + failed` (exists) | None — compute client-side |
| Stats pending drafts count | `agent.status.pendingDrafts` (in agentList) | None — aggregate client-side |

**Summary of new/changed IPCs (5 total):**
1. `draftList` — add optional `agentId: number` param
2. `draftList` — return `posted_at_ms?: number`, `posted_group_ids?: string[]` (joined)
3. `draftGenerate` — add optional `agentId: number` param
4. `stats` — add `period: 'today'|'7d'|'30d'|'all'` param (default: `'all'`)
5. `logList` (new endpoint) — `{ zaloId, ym?: string, limit?: number }` → `{ logs: Array<PostLog & { agent_name: string, group_name: string, draft_text_preview: string }> }`

---

## 5. Tailwind / Component Structure

### 5.1 Style patterns (match existing app)

```
Card container:  rounded-xl border bg-gray-800 p-3.5 border-gray-700
Active agent:    border-green-700/40
Inactive agent:  border-gray-700
Section header:  text-[11px] uppercase tracking-wide text-gray-500
Status badge:    text-[10px] px-1.5 py-0.5 rounded-full
Tab bar:         px-4 py-2 text-xs font-medium rounded-t-lg border-b-2
Primary CTA:     px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold
Danger action:   bg-red-700/20 text-red-300
Confirm action:  bg-green-700/30 text-emerald-300
```

### 5.2 New component inventory

```
AgentGroupChips           agents-tab.tsx        Chip row of resolved group names
PostNowConfirmPopover     agents-tab.tsx        Pre-flight confirm before agentPostNow
MigratedAgentBanner       agents-tab.tsx        Amber inline banner for default agent
AgentsOnboardingCard      agents-tab.tsx        Empty state with 3-step guide
FirstRunOnboardingCard    agents-tab.tsx        Full-tab onboarding for single migrated agent
AgentFilterBar            drafts-tab.tsx        Agent dropdown filter above status pills
DraftAgentLabel           drafts-tab.tsx        Small agent name chip on DraftCard
DraftPostedInfo           drafts-tab.tsx        "Đã đăng X → GroupName" sub-row on posted drafts
CalendarDayCell           calendar-tab.tsx      Day cell with 3 dot layers (posted/once/projected)
CalendarDayDetail         calendar-tab.tsx      Click-day detail with 3 sections
CalendarLegend            calendar-tab.tsx      Color legend strip under month nav
StatsKpiCard              stats-tab.tsx         Single KPI card component
AgentBarChart             stats-tab.tsx         Horizontal bars with 2 series + period filter
RecentActivityFeed        stats-tab.tsx         Last 10 log entries with status dot
ImageLibraryDrawer        (new file)            Slide-in panel for image management (replaces tab)
AgentResourcesDrawer      (new file)            Slide-in panel wrapping PillarsTab for pillars
```

### 5.3 Tab shell changes

```
// group-posting-page.tsx
type PostingTab = 'agents' | 'drafts' | 'calendar' | 'stats';

const TABS = [
  { id: 'agents',   label: '🤖 Agents' },
  { id: 'drafts',   label: '📝 Bài đăng' },
  { id: 'calendar', label: '📅 Lịch' },
  { id: 'stats',    label: '📊 Thống kê' },
];

// Remove: 'pillars' | 'images' tabs
// Add: AgentsTab gets prop: onOpenPillars, onOpenImages
// AgentsTab header: small "Chủ đề ↗" and "Thư viện ảnh ↗" links that open drawers
```

---

## 6. Top 10 Changes Ranked by User Impact

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Calendar: show posted history + projected recurring | High — calendar is currently useless after posting | Medium (new logList IPC + client-side projection) |
| 2 | Bài đăng: add agent filter + agent/group columns | High — impossible to manage drafts across agents | Low (render existing data + add agentId filter param) |
| 3 | Agents: PostNow confirmation popover with group list | High — prevents accidental mass-posts | Low (client-side only) |
| 4 | Stats: period filter + success rate KPI + activity feed | High — current stats are unactionable | Medium (new logList + period param on stats) |
| 5 | Agent mặc định: migration banner + onboarding card | High — source of the biggest confusion | Low (client-side detection + markup) |
| 6 | Agents: show actual group names on card | Medium — user can see who-posts-where at a glance | Low (cache allGroups in store) |
| 7 | Remove Chủ đề + Thư viện ảnh as top-level tabs | Medium — simplifies primary navigation | Medium (move into drawers, update AgentEditorModal) |
| 8 | Drafts: show posted-where info on posted drafts | Medium — closing the loop on what actually went out | Medium (extend draftList response) |
| 9 | Draft generate: attach agent_id to generated drafts | Medium — prevents orphaned unfiltered drafts | Low (add agentId param to draftGenerate) |
| 10 | Stats: horizontal bar chart with stacked failed series | Low-Medium — visual quality improvement | Low (CSS only, no new data) |

---

## Unresolved Questions

1. **`logList` IPC** — does it already exist as `ipc.posting.logList` or `ipc.posting.log.list`? The store has `postLogs` + `setPostLogs` but no tab currently calls it. Confirm if the backend handler exists before adding new IPC.
2. **Drawers vs sub-tabs in AgentEditorModal** — the modal is already 2-col `max-w-3xl`. Adding a third "section" for pillars makes it very tall. Consider whether pillars should be a separate route/drawer rather than squeezed into the modal.
3. **`calendarList` IPC shape** — does it accept a filter `agentId`? If multiple agents are shown on one calendar, the day detail needs to attribute each event to the right agent. Verify the current response includes `agent_id` / `agent_name`.
4. **"Đăng thử" in DraftsTab** calls `ipc.posting.botPostNow` — this appears to post to all groups of all agents for the zaloId, not agent-specific. Need to clarify intended behavior: should it post to all groups, or to the groups of the draft's agent only?
5. **allGroups cache invalidation** — groups change when user opens new Zalo chats. How often should `allGroups` be refreshed? Recommend: refresh on AgentsTab mount + add a "Tải lại nhóm" button.
