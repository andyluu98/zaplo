# Code Review — Facebook Page Channel (Phase 2)

Branch: `feat/fb-page-channel-phase1-5` · Date: 2026-08-24 · Reviewer: code-reviewer
Scope: Phase-2 slice (DB schema/migrations, secure secrets, OAuth/Graph client, IPC, wizard, context provider, tests).

## Hard-constraint verdict

| Constraint | Result |
|---|---|
| No Zalo auto-reply regression | PASS on all widened DB methods + PK rebuild. One adjacent defect (reconnect loop iterates Page rows) — does NOT break existing Zalo, see M1. |
| No plaintext secrets | PASS. `encryptStrict` hard-fails; IPC strips `*_enc`; wizard uses password field; page tokens never cross IPC. |
| Migration idempotency (existing populated DB) | PASS. Column-guarded, atomic transaction, createTables/migrate agree on final schema. |

## Findings

### High
None that break a hard constraint.

### Medium

**M1 — Zalo reconnect loops iterate Page account rows and attempt Zalo login on them.**
`electron/ipc/loginIpc.ts:299-315` (`login:reconnectAll`) and `electron/main.ts:672-690` (`startupAllWorkspaces`) iterate `getAccounts()` / `SELECT * FROM accounts WHERE is_active=1` with NO channel filter and call `loginService.connectUser({cookies, imei, userAgent})` on every row. `upsertPageAccount` (`DatabaseService.ts:8491-8500`) writes the Page as an `accounts` row with `channel='page'`, `is_active=1`, `cookies=''`. On each startup / reconnectAll the Page row hits `ZaloLoginHelper` which throws at `JSON.parse('')` ("Cookies không hợp lệ"). Caught per-row, so no crash and existing Zalo accounts still connect — but every connected Page produces a spurious failed Zalo-login attempt + warning log each startup.
Note: this is a PRE-EXISTING latent issue — `channel='facebook'` rows are already inserted into `accounts` with `is_active=1` (`DatabaseService.ts:2079-2082`) and share the exact same behavior. Page connect merely makes it observable again.
Fix: filter the two Zalo reconnect paths by `channel='zalo'` (or add a `channel` guard in `connectUser`). Do not broadly change `getAccounts()` without checking UI account-switcher consumers.

**M2 — `connectPage` performs three DB writes without a transaction.**
`page-auth-service.ts:217-219`: `upsertFbPage` → `upsertPageAccount` → `setFbAppAccessLevel` run as separate statements. A failure after the first leaves an `fb_page` credential row with no matching `accounts` row (Page shows in Step-3 list but has no conversation account). `encryptStrict` runs first (line 201), so an encryption failure writes nothing — good — but the multi-write path is not atomic. Wrap in `DatabaseService.transaction()`.

**M3 — Migration test re-implements the migration instead of calling it.**
`src/__tests__/page-schema-migration.test.ts` mirrors the DDL in a local `runMigration()` copy rather than invoking `DatabaseService.migrate()`. It proves the SQL is correct/idempotent in isolation but will NOT catch drift if the real `migrate()` changes. Acceptable pragmatic compromise (migrate() is Electron-coupled), but the guard is only the code comment. Consider extracting the migration DDL into a shared pure function both call, so the test exercises the real statements.

### Low

**L1 — OAuth redirect check is a prefix match, not the "exact origin+path match" the comment claims.**
`page-auth-service.ts:114-115`: `if (!url.startsWith(input.redirectUri)) return;`. A URL like `…/login_success.htmlEXTRA?code=` would also pass. Not exploitable in practice: the window is an isolated in-memory partition and `redirect_uri` is on `www.facebook.com`, so only Facebook can serve a matching page. Tighten to compare `origin+pathname` exactly, or fix the comment.

**L2 — "unknown" Meta errors surface the raw Graph message to the renderer.**
`page-graph-client.ts:48` returns `e.message` for the unknown bucket. Logs are safe (only `code`/`kind` logged), and Meta does not echo secrets in error text, so this is theoretical. Token/rate/permission buckets use fixed safe copy (verified by test).

**L3 — `PendingConnect.ts` timestamp is dead; "session expired" message is misleading.**
`page-auth-service.ts:35,171,195`: `ts` is written but never read. `this.pending` is only null-checked / overwritten; there is no TTL, so the "Phiên kết nối đã hết hạn" error can never fire from a real timeout. Either enforce a TTL against `ts` or drop the field and reword.

**L4 — `upsertPageAccount` ON CONFLICT does not guard `channel`.**
`DatabaseService.ts:8496-8499`: `ON CONFLICT(zalo_id) DO UPDATE` overwrites `full_name/avatar_url/is_active` if a row with the same `zalo_id` exists. Page IDs and Zalo IDs are different ID spaces so collision is astronomically unlikely, but the update path does not assert `channel='page'`.

## Verified clean

- Widened `listEnabledChatAgents` / `getConversationAiState` / `setConversationAiState` default `channel='zalo'`; the only non-Page callers are `zalo-context-provider.ts` which omit the arg → identical prior behavior. Existing rows backfilled to `'zalo'` by the `NOT NULL DEFAULT 'zalo'` ALTER.
- `conversation_ai_state` PK rebuild is column-guarded, wrapped in `db.transaction()` (atomic — Zalo pause-state cannot be lost mid-failure), backfills `channel='zalo'`, and matches the createTables definition. Round-trip + idempotency proven by tests.
- `fb_app`/`fb_page` created via `CREATE TABLE IF NOT EXISTS` in both createTables and migrate with identical column definitions.
- `deleteFbPage` scopes every DELETE to `channel='page'` (messages/contacts/accounts/conversation_ai_state/chat_agent) and deletes thread/label links only for Page agent ids — no Zalo/FB-personal data reachable. Wrapped in a transaction.
- Secrets: app secret / verify token / page token always via `encryptStrict` (hard-fail `EncryptionUnavailableError`); `publicApp` strips `*_enc` and exposes only `hasSecret`/`hasVerifyToken` booleans; `publicPage` strips `access_token_enc`; code→token exchange runs in main process; page tokens held in `this.pending` (main) only. No token/secret reaches `Logger` (grep clean).
- OAuth: 128-bit random `state` verified on return (mismatch → reject); `error` handled; missing `code` handled; isolated in-memory `fromPartition('fb-page-oauth')` cleared in `finish()`; `setWindowOpenHandler` denies popups; `will-navigate`/`will-redirect` both intercepted; `closed` handled; `finish()` idempotent via `settled` flag (no double-resolve).
- Meta error translation buckets (190/102/463/467→token, 4/17/32/613→rate, 10/200-299→permission) verified by unit test incl. secret-leak assertions.
- No new breaking changes to public signatures — all additions are optional trailing params / new methods / new IPC channels under a distinct `fbpage:` namespace.

## Unresolved questions
- Should Page rows carry `is_active=1` in `accounts` at all, given the Zalo reconnect loops key off it? (Drives the M1 fix choice.)
