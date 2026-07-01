import BetterSqlite3 from 'better-sqlite3';
import {
  createImageFolderTables,
  migrateImageAssetFolderColumn,
} from '../services/posting/image-folder-store';

function makeDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE image_asset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_zalo_id TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'upload',
      width INTEGER, height INTEGER,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

test('createImageFolderTables: tạo bảng image_folder + index, chạy 2 lần không lỗi', () => {
  const db = makeDb();
  createImageFolderTables(db);
  createImageFolderTables(db); // idempotent
  const cols = db.prepare(`PRAGMA table_info(image_folder)`).all() as any[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(
    expect.arrayContaining(['id', 'owner_zalo_id', 'name', 'description', 'sort_order', 'created_at', 'updated_at']),
  );
});

test('migrateImageAssetFolderColumn: thêm cột folder_id, idempotent (2 lần OK)', () => {
  const db = makeDb();
  migrateImageAssetFolderColumn(db);
  migrateImageAssetFolderColumn(db); // không throw dù cột đã có
  const cols = db.prepare(`PRAGMA table_info(image_asset)`).all() as any[];
  expect(cols.some(c => c.name === 'folder_id')).toBe(true);
});
