/**
 * image-folder-store.ts
 * Pure DB helpers for the image-folder feature (no electron import — can run in Jest).
 * DatabaseService.ts calls these functions so it doesn't have to inline the SQL.
 */
import type BetterSqlite3 from 'better-sqlite3';

/** Tạo bảng image_folder + index. Idempotent (IF NOT EXISTS). */
export function createImageFolderTables(db: BetterSqlite3.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS image_folder (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_zalo_id TEXT NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    INTEGER NOT NULL DEFAULT 0,
            updated_at    INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_image_folder_owner ON image_folder(owner_zalo_id);
    `);
}

/** Thêm cột image_asset.folder_id nếu chưa có (idempotent qua PRAGMA table_info). */
export function migrateImageAssetFolderColumn(db: BetterSqlite3.Database): void {
    const cols = db.prepare(`PRAGMA table_info(image_asset)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'folder_id')) {
        db.exec(`ALTER TABLE image_asset ADD COLUMN folder_id INTEGER`); // NULL = Chưa phân loại
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_image_asset_folder ON image_asset(folder_id)`);
}
