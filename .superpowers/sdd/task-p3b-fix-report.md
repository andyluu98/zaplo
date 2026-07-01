# Task P3B Fix Report

## Changes

### 1. Hoist `Radio` out of render body
- **File:** `src/ui/components/posting/image-library/folder-modals.tsx`
- Extracted inline `const Radio` from `DeleteFolderModal` body → module-level `function DeleteModeRadio`
- Props changed: removed implicit `mode` closure capture; added explicit `checked: boolean` and `onSelect` callback
- Usages updated: `<Radio value="move" ...>` → `<DeleteModeRadio value="move" checked={mode==='move'} onSelect={setMode} ...>`

### 2. Fix null fallback
- **File:** `src/ui/components/posting/image-library/folder-list.tsx`
- `onSelect(f.id ?? 'all')` → `onSelect(f.id ?? null)`
- Reason: folder with null id = Chưa phân loại, not Tất cả

### 3. Export `FolderKey` type
- **File:** `src/ui/components/posting/image-library/folder-list.tsx`
- `type FolderKey` → `export type FolderKey`

## TSC Result
`npx tsc --noEmit` — **clean (no errors)**
