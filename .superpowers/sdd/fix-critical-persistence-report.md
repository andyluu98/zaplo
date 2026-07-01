# Fix: Critical Persistence Gaps — Folder Image Fields

## What Changed

### FIX 1 — `posting_agent` table

**Migration** (`src/services/posting/image-folder-store.ts`)
- Added `migratePostingAgentFolderColumns(db)`: PRAGMA-guarded idempotent ALTER adds `image_folder_id INTEGER` + `image_count_random INTEGER NOT NULL DEFAULT 0`.
- Called from `DatabaseService.ts` in the migration block after `migrateImageAssetFolderColumn`.

**savePostingAgent** (`src/services/database/DatabaseService.ts` ~line 8059)
- INSERT: added `image_folder_id, image_count_random` to column list + values.
- UPDATE SET: added `image_folder_id=?, image_count_random=?`.
- Boolean coercion: `a.image_count_random ? 1 : 0` → stored as 0/1 integer (same pattern as `enabled`).
- `getPostingAgent` uses `SELECT *` → picks up new columns automatically; no explicit field list to update.

### FIX 2 — `post_store` table

**Migration** (`src/services/posting/image-folder-store.ts`)
- Added `migratePostStoreFolderColumns(db)`: PRAGMA-guarded idempotent ALTER adds `image_folder_id INTEGER` + `image_random INTEGER NOT NULL DEFAULT 0`.
- Called from `DatabaseService.ts` migration block after posting_agent migration.

**savePost** (`src/services/database/DatabaseService.ts` ~line 411)
- Type signature extended: `image_folder_id?: number | null; image_random?: boolean`.
- INSERT + UPDATE both persist `image_folder_id` (null-coerced) and `image_random` (0/1).

**listDueSchedule + listScheduleRange** (`src/services/database/DatabaseService.ts` ~line 442)
- Both SELECT queries now include `p.image_folder_id, p.image_random` from the `post_store` JOIN so schedule-runner receives them via `item.image_folder_id` / `item.image_random`.

**post-store-ipc.ts** (`electron/ipc/post-store-ipc.ts`)
- `poststore:save` handler type extended to accept `image_folder_id?: number | null; image_random?: boolean`; fields pass through to `savePost` transparently.
- Renderer already sends these fields (`post-store-tab.tsx` line 67-68).

## Migration Test Evidence

File: `src/__tests__/image-folder-store.test.ts` — 4 new tests added (17 total, all GREEN):

| Test | Result |
|------|--------|
| `migratePostingAgentFolderColumns`: thêm cột, idempotent 2 lần | PASS |
| `migratePostingAgentFolderColumns`: cột đã tồn tại → không throw | PASS |
| `migratePostStoreFolderColumns`: thêm cột, idempotent 2 lần | PASS |
| `migratePostStoreFolderColumns`: cột đã tồn tại → không throw | PASS |

`npx tsc --noEmit` → clean (0 errors).

## Round-Trip Summary

| Field | Insert | Update | Select path |
|-------|--------|--------|-------------|
| `posting_agent.image_folder_id` | ✓ | ✓ | `SELECT *` in getPostingAgent |
| `posting_agent.image_count_random` | ✓ (0/1) | ✓ (0/1) | `SELECT *` in getPostingAgent |
| `post_store.image_folder_id` | ✓ | ✓ | listDueSchedule + listScheduleRange |
| `post_store.image_random` | ✓ (0/1) | ✓ (0/1) | listDueSchedule + listScheduleRange |

## Files Modified

- `src/services/posting/image-folder-store.ts` — +2 migration functions
- `src/services/database/DatabaseService.ts` — import, 2 migration calls, savePost, savePostingAgent, listDueSchedule, listScheduleRange
- `electron/ipc/post-store-ipc.ts` — extended poststore:save payload type
- `src/__tests__/image-folder-store.test.ts` — 4 new idempotency tests

## Unresolved Questions
- None. All fields round-trip. No `image_count_random` boolean coercion needed on read since callers treat truthy integers as boolean in JS.
