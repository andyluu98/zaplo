/**
 * image-folder-store.ts
 * Pure DB helpers for the image-folder feature (no electron import — can run in Jest).
 * DatabaseService.ts calls these functions so it doesn't have to inline the SQL.
 */
import type BetterSqlite3 from 'better-sqlite3';
import type { ImageFolder, ImageAsset } from '../../models/automation';

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

/** List folder theo owner, kèm image_count (COUNT ảnh có folder_id = folder.id). */
export function getImageFolders(db: BetterSqlite3.Database, zaloId: string): ImageFolder[] {
    return db.prepare(`
        SELECT f.*, COUNT(a.id) AS image_count
        FROM image_folder f
        LEFT JOIN image_asset a ON a.folder_id = f.id AND a.owner_zalo_id = f.owner_zalo_id
        WHERE f.owner_zalo_id = ?
        GROUP BY f.id
        ORDER BY f.sort_order ASC, f.name COLLATE NOCASE
    `).all(zaloId) as ImageFolder[];
}

/** Insert (nếu !id) hoặc update (chỉ WHERE owner khớp). Trả id folder. */
export function saveImageFolder(db: BetterSqlite3.Database, f: ImageFolder): { id: number } {
    const now = Date.now();
    if (!f.id) {
        const r = db.prepare(`
            INSERT INTO image_folder (owner_zalo_id, name, description, sort_order, created_at, updated_at)
            VALUES (?,?,?,?,?,?)
        `).run(f.owner_zalo_id, f.name, f.description ?? null, f.sort_order ?? 0, now, now);
        return { id: Number(r.lastInsertRowid) };
    }
    db.prepare(`
        UPDATE image_folder SET name=?, description=?, sort_order=?, updated_at=?
        WHERE id=? AND owner_zalo_id=?
    `).run(f.name, f.description ?? null, f.sort_order ?? 0, now, f.id, f.owner_zalo_id);
    return { id: f.id };
}

/**
 * Xóa folder.
 * - move : ảnh trong folder → folder_id=NULL (Chưa phân loại)
 * - purge: xóa ảnh trong folder (trả rel_path để caller xóa file), rồi xóa folder
 * Bọc transaction để nhất quán.
 */
export function deleteImageFolder(
    db: BetterSqlite3.Database,
    zaloId: string,
    id: number,
    mode: 'move' | 'purge',
): { purgedRelPaths: string[] } {
    return db.transaction(() => {
        let purgedRelPaths: string[] = [];
        if (mode === 'purge') {
            purgedRelPaths = (db.prepare(
                `SELECT rel_path FROM image_asset WHERE owner_zalo_id=? AND folder_id=?`,
            ).all(zaloId, id) as Array<{ rel_path: string }>).map(r => r.rel_path);
            db.prepare(`DELETE FROM image_asset WHERE owner_zalo_id=? AND folder_id=?`).run(zaloId, id);
        } else {
            db.prepare(`UPDATE image_asset SET folder_id=NULL WHERE owner_zalo_id=? AND folder_id=?`).run(zaloId, id);
        }
        db.prepare(`DELETE FROM image_folder WHERE id=? AND owner_zalo_id=?`).run(id, zaloId);
        return { purgedRelPaths };
    })();
}

/** Ảnh theo folder: 'all'/undefined = mọi ảnh; null = chưa phân loại; số = folder cụ thể. Sắp xếp mới nhất trước. */
export function getImages(
    db: BetterSqlite3.Database,
    zaloId: string,
    folderId?: number | null | 'all',
): ImageAsset[] {
    if (folderId === undefined || folderId === 'all') {
        return db.prepare(
            `SELECT * FROM image_asset WHERE owner_zalo_id=? ORDER BY created_at DESC`,
        ).all(zaloId) as ImageAsset[];
    }
    if (folderId === null) {
        return db.prepare(
            `SELECT * FROM image_asset WHERE owner_zalo_id=? AND folder_id IS NULL ORDER BY created_at DESC`,
        ).all(zaloId) as ImageAsset[];
    }
    return db.prepare(
        `SELECT * FROM image_asset WHERE owner_zalo_id=? AND folder_id=? ORDER BY created_at DESC`,
    ).all(zaloId, folderId) as ImageAsset[];
}

/** Gán folder_id (hoặc NULL) cho mảng ids, scope theo owner. ids rỗng → no-op. */
export function moveImages(
    db: BetterSqlite3.Database,
    zaloId: string,
    ids: number[],
    folderId: number | null,
): void {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
        `UPDATE image_asset SET folder_id=? WHERE owner_zalo_id=? AND id IN (${placeholders})`,
    ).run(folderId, zaloId, ...ids);
}
