# Deplao Automation — Implementation Report

Branch: `feat/automation` (off `main`) · Repo: `zep-lao` · Date: 2026-06-21
Plan: `kanban AI/plans/260620-2209-deplao-automation/plan.md`
Mode: sequential in-session subagents (user chose Cách 1, NOT multi-session team) — DB→IPC→UI coupling made parallel risky.

## Done & verified (gates green at every step)
Gate = `tsc -p tsconfig.electron.json` (0) + `tsc -p tsconfig.json --noEmit` (0) + adversarial review. Final: full `vite build` OK.

### Phase 0 — baseline
- `npm install` (Electron + native better-sqlite3). Branch `feat/automation`. Baseline build green.
- NOTE: repo has NO `npm test` script → gate = 2 compile passes + reviewer (no unit-test framework present).

### Phase 1 — Feature A: AI auto-reply
- Per-account toggle "AI tự trả lời" → creates/enables a hidden workflow `autoreply-{zaloId}` (trigger.message → ai.generateText → zalo.sendMessage) bound to chosen assistant; OFF removes it. Workflow IS source of truth (no schema migration — avoided the `ai_account_assistants` CHECK-constraint landmine).
- Files: `src/services/ai/auto-reply-workflow-manager.ts` (new), `src/ui/components/settings/conversation/AutoReplySettings.tsx` (new), edits to `aiAssistantIpc.ts`, `preload.ts`, `ConversationSettings.tsx`.
- Review fixes applied: toggle no longer reports false success on DB write failure; fast-toggle desync guarded.

### Phase 2 — Feature B backend
- 5 tables (content_pillar, content_draft, image_asset, post_schedule, post_log) + ~18 CRUD + `countPostsToday` in `DatabaseService.ts`; types in `src/models/automation.ts`.
- `posting-scheduler-service.ts` (clones CRMQueueService token-bucket; per-account timers; random slots in window; hard cap 1-3/day/group; emits `postingBot:update`). `content-draft-generator.ts` (AI N drafts from pillar). `postingIpc.ts` + `posting:` preload namespace. Registered in `main.ts` + startup resume.
- zaloId→send via `ConnectionManager.getConnection(zaloId).api` (same as CRM). Realtime via `EventBroadcaster`.
- Review fixes (anti-spam = ban-risk critical): C1 groups.list read wrong zca-js shape → now reads synced group contacts from DB (DRY). Draft only marked 'posted' if ≥1 send succeeded (no silent loss). Slots no longer consumed before MIN_DELAY/connection checks. Exhausted daily plan not rebuilt same-day. `countPostsToday` fail-CLOSED (DB error → skip send, never uncapped).

### Phase 3 — image library (upload only)
- `posting:image.upload/list/delete` via FileStorageService (`media/{zaloId}/{date}/`), rendered with `toLocalMediaUrl` + `local-media://`. Reused existing `file:openDialog` (DRY). AI image-GEN deferred (needs key).

### Phase 4 — Feature B UI
- Top-level page `group-posting-page.tsx` + sidebar nav "Đăng bài nhóm" + `posting-store.ts` (Zustand) + typed `ipc.posting.*`.
- 4 tabs: `pillars-tab` (CRUD), `image-library-tab` (grid+upload), `drafts-tab` + `draft-edit-modal` (approval grid, status filter, AI-generate, approve/reject/edit, bulk via Promise.allSettled), `schedule-tab` (group multiselect, posts/day 1-3, time window, enable).
- Review fixes: bot-status seeded on mount/account-change; stale generate-pillar reset; optimistic rollback patches only status from live store. I1 (typed-as-any) was a FALSE alarm — verified via @ts-expect-error probe that posting types ARE enforced.

### Phase 5 — safety
- DONE inside scheduler: rate-limit, random-in-window, jitter, fail-closed hard cap. Reporting UI = plan B7 "giai đoạn 2" (post_log + log.list IPC exist; no dedicated report view yet).

## Deferred by design
- AI image generation (Phase 3 optional): needs image API key + provider + cost decision.
- Reporting UI (B7): phase 2.
- v1 = Zalo only (Facebook auto-reply not built).

## Needs user decision
1. Permission gating: Feature A `ai:toggleAutoReply` handler + Feature B nav button are NOT employee-mode/RBAC gated (matches existing ai:* convention, but other modules like crm/erp ARE gated). Gate them or leave open?
2. Commit: held all commits (rule: commit only when asked). Commit whole feature on `feat/automation` (no push)?
3. Push: plan says GitHub push needs fork to `andyluu98` (repo is babyvibe's). Default = no push until decided.

## Manual E2E checkpoints (agent cannot do — need real Zalo login + LLM API key)
- Auto-reply: login a real Zalo acc → toggle ON → message from another device → confirm AI auto-sends.
- Group posting: approve 1 draft → wait for scheduler → confirm it posts into the test group.

## Unresolved questions
- Image-gen provider/key (if/when Phase 3 AI images wanted)?
- posts_per_day semantics confirmed = per-group/day (matches plan "1-3 bài/ngày/nhóm"). OK?
