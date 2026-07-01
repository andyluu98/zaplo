import BetterSqlite3 from 'better-sqlite3';
import {
  createImageFolderTables,
  migrateImageAssetFolderColumn,
  migratePostingAgentFolderColumns,
  migratePostStoreFolderColumns,
  getImageFolders,
  saveImageFolder,
  deleteImageFolder,
  getImages,
  moveImages,
  deleteImages,
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

// ─── Helpers for CRUD tests ──────────────────────────────────────────────────

function seedFolderSchema(db: BetterSqlite3.Database) {
  createImageFolderTables(db);
  migrateImageAssetFolderColumn(db);
}

function insertAsset(db: BetterSqlite3.Database, zaloId: string, relPath: string, folderId: number | null) {
  db.prepare(`INSERT INTO image_asset (owner_zalo_id, rel_path, origin, folder_id, created_at) VALUES (?,?,?,?,?)`)
    .run(zaloId, relPath, 'upload', folderId, Date.now());
}

// ─── CRUD tests ──────────────────────────────────────────────────────────────

test('saveImageFolder: insert trả id > 0, list thấy folder', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  expect(id).toBeGreaterThan(0);
  const list = getImageFolders(db, 'z1');
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('SP A');
  expect(list[0].image_count).toBe(0);
});

test('getImageFolders: image_count đếm đúng ảnh trong folder, scope theo owner', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  insertAsset(db, 'z1', 'a.jpg', id);
  insertAsset(db, 'z1', 'b.jpg', id);
  insertAsset(db, 'z1', 'c.jpg', null);      // chưa phân loại — không tính vào folder
  insertAsset(db, 'z2', 'd.jpg', id);        // owner khác — không thấy
  const list = getImageFolders(db, 'z1');
  expect(list).toHaveLength(1);
  expect(list[0].image_count).toBe(2);
  expect(getImageFolders(db, 'z2')).toHaveLength(0);
});

test('saveImageFolder: update chỉ khi owner khớp; owner sai không đổi', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'Cũ' });
  saveImageFolder(db, { id, owner_zalo_id: 'z1', name: 'Mới' });
  expect(getImageFolders(db, 'z1')[0].name).toBe('Mới');
  saveImageFolder(db, { id, owner_zalo_id: 'zX', name: 'Hack' }); // owner sai → no-op
  expect(getImageFolders(db, 'z1')[0].name).toBe('Mới');
});

test('deleteImageFolder mode=move: ảnh về folder_id=NULL, folder biến mất', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  insertAsset(db, 'z1', 'a.jpg', id);
  const res = deleteImageFolder(db, 'z1', id, 'move');
  expect(res.purgedRelPaths).toEqual([]);
  expect(getImageFolders(db, 'z1')).toHaveLength(0);
  const orphan = db.prepare(`SELECT folder_id FROM image_asset WHERE rel_path='a.jpg'`).get() as any;
  expect(orphan.folder_id).toBeNull();
});

test('deleteImageFolder mode=purge: trả rel_path đã xóa + xóa ảnh + xóa folder', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  insertAsset(db, 'z1', 'a.jpg', id);
  insertAsset(db, 'z1', 'b.jpg', id);
  const res = deleteImageFolder(db, 'z1', id, 'purge');
  expect(res.purgedRelPaths.sort()).toEqual(['a.jpg', 'b.jpg']);
  expect(db.prepare(`SELECT COUNT(*) n FROM image_asset WHERE folder_id=?`).get(id)).toMatchObject({ n: 0 });
  expect(getImageFolders(db, 'z1')).toHaveLength(0);
});

// ─── getImages + moveImages tests ────────────────────────────────────────────

test('getImages: all trả mọi ảnh; null trả chưa phân loại; số trả trong folder', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  insertAsset(db, 'z1', 'a.jpg', id);
  insertAsset(db, 'z1', 'b.jpg', null);
  insertAsset(db, 'z1', 'c.jpg', null);
  insertAsset(db, 'z2', 'z.jpg', null); // owner khác

  expect(getImages(db, 'z1', 'all').map(a => a.rel_path).sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  expect(getImages(db, 'z1').map(a => a.rel_path).sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']); // undefined = all
  expect(getImages(db, 'z1', null).map(a => a.rel_path).sort()).toEqual(['b.jpg', 'c.jpg']);
  expect(getImages(db, 'z1', id).map(a => a.rel_path)).toEqual(['a.jpg']);
});

test('moveImages: gán folder_id cho nhiều ảnh, scope theo owner', () => {
  const db = makeDb(); seedFolderSchema(db);
  const { id } = saveImageFolder(db, { owner_zalo_id: 'z1', name: 'SP A' });
  insertAsset(db, 'z1', 'a.jpg', null);
  insertAsset(db, 'z1', 'b.jpg', null);
  const ids = (db.prepare(`SELECT id FROM image_asset WHERE owner_zalo_id='z1'`).all() as any[]).map(r => r.id);
  moveImages(db, 'z1', ids, id);
  expect(getImages(db, 'z1', id)).toHaveLength(2);
  moveImages(db, 'z1', ids, null); // về chưa phân loại
  expect(getImages(db, 'z1', null)).toHaveLength(2);
});

test('moveImages: ids rỗng → no-op không lỗi', () => {
  const db = makeDb(); seedFolderSchema(db);
  expect(() => moveImages(db, 'z1', [], null)).not.toThrow();
});

// ─── deleteImages tests ──────────────────────────────────────────────────────

test('deleteImages: xóa nhiều ảnh, trả rel_path để xóa file, scope owner', () => {
  const db = makeDb(); seedFolderSchema(db);
  insertAsset(db, 'z1', 'a.jpg', null);
  insertAsset(db, 'z1', 'b.jpg', null);
  insertAsset(db, 'z2', 'z.jpg', null); // owner khác — không đụng
  const ids = (db.prepare(`SELECT id FROM image_asset WHERE owner_zalo_id='z1'`).all() as any[]).map(r => r.id);
  const res = deleteImages(db, 'z1', ids);
  expect(res.purgedRelPaths.sort()).toEqual(['a.jpg', 'b.jpg']);
  expect(getImages(db, 'z1', 'all')).toHaveLength(0);
  expect(getImages(db, 'z2', 'all')).toHaveLength(1); // owner khác còn nguyên
});

test('deleteImages: ids rỗng → no-op, trả rỗng', () => {
  const db = makeDb(); seedFolderSchema(db);
  expect(deleteImages(db, 'z1', [])).toEqual({ purgedRelPaths: [] });
});

// ─── Migration: posting_agent folder columns ─────────────────────────────────

function makePostingAgentDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE posting_agent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_zalo_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      assistant_id TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      approval_mode TEXT NOT NULL DEFAULT 'manual',
      image_mode TEXT NOT NULL DEFAULT 'auto',
      image_count INTEGER NOT NULL DEFAULT 2,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

test('migratePostingAgentFolderColumns: thêm image_folder_id + image_count_random, idempotent (2 lần OK)', () => {
  const db = makePostingAgentDb();
  migratePostingAgentFolderColumns(db);
  migratePostingAgentFolderColumns(db); // không throw
  const cols = db.prepare(`PRAGMA table_info(posting_agent)`).all() as any[];
  const names = cols.map((c: any) => c.name);
  expect(names).toContain('image_folder_id');
  expect(names).toContain('image_count_random');
});

test('migratePostingAgentFolderColumns: cột đã tồn tại trước (như DB mới) → không throw', () => {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE posting_agent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_folder_id INTEGER,
      image_count_random INTEGER NOT NULL DEFAULT 0
    );
  `);
  expect(() => migratePostingAgentFolderColumns(db)).not.toThrow();
});

// ─── Migration: post_store folder columns ────────────────────────────────────

function makePostStoreDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE post_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      image_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

test('migratePostStoreFolderColumns: thêm image_folder_id + image_random, idempotent (2 lần OK)', () => {
  const db = makePostStoreDb();
  migratePostStoreFolderColumns(db);
  migratePostStoreFolderColumns(db); // không throw
  const cols = db.prepare(`PRAGMA table_info(post_store)`).all() as any[];
  const names = cols.map((c: any) => c.name);
  expect(names).toContain('image_folder_id');
  expect(names).toContain('image_random');
});

test('migratePostStoreFolderColumns: cột đã tồn tại trước (như DB mới) → không throw', () => {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE post_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_folder_id INTEGER,
      image_random INTEGER NOT NULL DEFAULT 0
    );
  `);
  expect(() => migratePostStoreFolderColumns(db)).not.toThrow();
});

// ─── Model type tests ────────────────────────────────────────────────────────

import type { ImageFolder, ImageAsset, PostingAgent, AgentImageMode } from '../models/automation';

test('models: ImageFolder + ImageAsset.folder_id + PostingAgent folder fields tồn tại', () => {
  const f: ImageFolder = { owner_zalo_id: 'z1', name: 'SP A', description: null, sort_order: 0, image_count: 3 };
  const a: ImageAsset = { owner_zalo_id: 'z1', rel_path: 'media/x.jpg', origin: 'upload', folder_id: 5 };
  const mode: AgentImageMode = 'folder';
  const ag: Partial<PostingAgent> = { image_folder_id: 5, image_count_random: true };
  expect(f.name).toBe('SP A');
  expect(a.folder_id).toBe(5);
  expect(mode).toBe('folder');
  expect(ag.image_count_random).toBe(true);
});
