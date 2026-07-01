// src/__tests__/image-ipc-helpers.test.ts
import {
  folderListLogic,
  folderSaveLogic,
  folderDeleteLogic,
  imageListLogic,
  imageMoveLogic,
  normalizeDeleteIds,
  type Db,
} from '../services/posting/image-ipc-helpers';
import type { ImageFolder, ImageAsset } from '../models/automation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Err = { success: false; error: string };

/** Narrow a result to Err after asserting success===false. */
function asErr(r: { success: boolean }): Err {
  return r as Err;
}

function makeDb(overrides: Partial<Db> = {}): jest.Mocked<Db> {
  return {
    getImageFolders: jest.fn().mockReturnValue([]),
    saveImageFolder: jest.fn().mockReturnValue({ id: 1 }),
    deleteImageFolder: jest.fn().mockReturnValue({ purgedRelPaths: [] }),
    getImages: jest.fn().mockReturnValue([]),
    moveImages: jest.fn(),
    deleteImages: jest.fn().mockReturnValue({ purgedRelPaths: [] }),
    save: jest.fn(),
    ...overrides,
  } as jest.Mocked<Db>;
}

const FOLDER: ImageFolder = { owner_zalo_id: 'z1', name: 'Sản phẩm A' };
const ASSET: ImageAsset = { id: 10, owner_zalo_id: 'z1', rel_path: 'media/z1/img.jpg', origin: 'upload' };

// ─── Task 1: folder helpers ───────────────────────────────────────────────────

describe('folderListLogic', () => {
  it('returns error when zaloId is empty', () => {
    const db = makeDb();
    const result = folderListLogic(db, { zaloId: '' });
    expect(result.success).toBe(false);
    expect(asErr(result).error).toMatch(/zaloId/i);
    expect(db.getImageFolders).not.toHaveBeenCalled();
  });

  it('calls db.getImageFolders and returns folders', () => {
    const db = makeDb({ getImageFolders: jest.fn().mockReturnValue([FOLDER]) });
    const result = folderListLogic(db, { zaloId: 'z1' });
    expect(db.getImageFolders).toHaveBeenCalledWith('z1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.folders).toEqual([FOLDER]);
  });
});

describe('folderSaveLogic', () => {
  it('returns error when zaloId is empty', () => {
    const db = makeDb();
    const result = folderSaveLogic(db, { zaloId: '', folder: FOLDER });
    expect(result.success).toBe(false);
  });

  it('returns error when folder.name is empty string', () => {
    const db = makeDb();
    const result = folderSaveLogic(db, { zaloId: 'z1', folder: { ...FOLDER, name: '' } });
    expect(result.success).toBe(false);
    expect(asErr(result).error).toBeTruthy();
  });

  it('returns error when folder.name is whitespace only', () => {
    const db = makeDb();
    const result = folderSaveLogic(db, { zaloId: 'z1', folder: { ...FOLDER, name: '   ' } });
    expect(result.success).toBe(false);
  });

  it('calls saveImageFolder with owner_zalo_id=zaloId and calls save()', () => {
    const db = makeDb({ saveImageFolder: jest.fn().mockReturnValue({ id: 42 }) });
    const result = folderSaveLogic(db, { zaloId: 'z1', folder: { ...FOLDER, owner_zalo_id: 'old' } });
    expect(db.saveImageFolder).toHaveBeenCalledWith(expect.objectContaining({ owner_zalo_id: 'z1' }));
    expect(db.save).toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) expect(result.id).toBe(42);
  });
});

describe('folderDeleteLogic', () => {
  it('returns error when mode is invalid', () => {
    const db = makeDb();
    // @ts-expect-error intentional bad mode for test
    const result = folderDeleteLogic(db, { zaloId: 'z1', id: 5, mode: 'destroy' });
    expect(result.success).toBe(false);
    expect(asErr(result).error).toMatch(/move|purge/);
  });

  it('returns error when zaloId is missing', () => {
    const db = makeDb();
    const result = folderDeleteLogic(db, { zaloId: '', id: 5, mode: 'purge' });
    expect(result.success).toBe(false);
  });

  it('returns error when id is 0/falsy', () => {
    const db = makeDb();
    const result = folderDeleteLogic(db, { zaloId: 'z1', id: 0, mode: 'purge' });
    expect(result.success).toBe(false);
  });

  it('calls deleteImageFolder(purge) + save(), returns purgedRelPaths', () => {
    const paths = ['media/z1/img.jpg'];
    const db = makeDb({ deleteImageFolder: jest.fn().mockReturnValue({ purgedRelPaths: paths }) });
    const result = folderDeleteLogic(db, { zaloId: 'z1', id: 5, mode: 'purge' });
    expect(db.deleteImageFolder).toHaveBeenCalledWith('z1', 5, 'purge');
    expect(db.save).toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) expect(result.purgedRelPaths).toEqual(paths);
  });

  it('calls deleteImageFolder with mode=move', () => {
    const db = makeDb();
    const result = folderDeleteLogic(db, { zaloId: 'z1', id: 5, mode: 'move' });
    expect(db.deleteImageFolder).toHaveBeenCalledWith('z1', 5, 'move');
    expect(result.success).toBe(true);
  });
});

// ─── Task 2: image helpers ────────────────────────────────────────────────────

describe('imageListLogic', () => {
  it('returns error when zaloId is empty', () => {
    const db = makeDb();
    const result = imageListLogic(db, { zaloId: '' });
    expect(result.success).toBe(false);
  });

  it("forwards folderId='all' to db.getImages", () => {
    const db = makeDb({ getImages: jest.fn().mockReturnValue([ASSET]) });
    const result = imageListLogic(db, { zaloId: 'z1', folderId: 'all' });
    expect(db.getImages).toHaveBeenCalledWith('z1', 'all');
    expect(result.success).toBe(true);
    if (result.success) expect(result.assets).toEqual([ASSET]);
  });

  it('forwards folderId=null to db.getImages (Chưa phân loại)', () => {
    const db = makeDb();
    imageListLogic(db, { zaloId: 'z1', folderId: null });
    expect(db.getImages).toHaveBeenCalledWith('z1', null);
  });

  it('forwards numeric folderId to db.getImages', () => {
    const db = makeDb();
    imageListLogic(db, { zaloId: 'z1', folderId: 3 });
    expect(db.getImages).toHaveBeenCalledWith('z1', 3);
  });

  it('forwards undefined folderId when omitted', () => {
    const db = makeDb();
    imageListLogic(db, { zaloId: 'z1' });
    expect(db.getImages).toHaveBeenCalledWith('z1', undefined);
  });
});

describe('imageMoveLogic', () => {
  it('returns error when zaloId is empty', () => {
    const db = makeDb();
    const result = imageMoveLogic(db, { zaloId: '', ids: [1], folderId: null });
    expect(result.success).toBe(false);
  });

  it('returns error when ids is empty array', () => {
    const db = makeDb();
    const result = imageMoveLogic(db, { zaloId: 'z1', ids: [], folderId: null });
    expect(result.success).toBe(false);
    expect(asErr(result).error).toBeTruthy();
  });

  it('calls moveImages with ids and save()', () => {
    const db = makeDb();
    const result = imageMoveLogic(db, { zaloId: 'z1', ids: [1, 2], folderId: null });
    expect(db.moveImages).toHaveBeenCalledWith('z1', [1, 2], null);
    expect(db.save).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('deduplicates ids before calling moveImages', () => {
    const db = makeDb();
    imageMoveLogic(db, { zaloId: 'z1', ids: [1, 2, 2, 1], folderId: 5 });
    expect(db.moveImages).toHaveBeenCalledWith('z1', [1, 2], 5);
  });
});

describe('normalizeDeleteIds', () => {
  it('{id:5} → [5]', () => {
    expect(normalizeDeleteIds({ id: 5 })).toEqual([5]);
  });

  it('{ids:[1,2,2]} → [1,2] (dedupe)', () => {
    expect(normalizeDeleteIds({ ids: [1, 2, 2] })).toEqual([1, 2]);
  });

  it('{} → []', () => {
    expect(normalizeDeleteIds({})).toEqual([]);
  });

  it('filters out non-positive values (0, negative)', () => {
    expect(normalizeDeleteIds({ ids: [0, -1, 3, 5] })).toEqual([3, 5]);
  });

  it('filters out non-number values', () => {
    // @ts-expect-error intentional bad input for test
    expect(normalizeDeleteIds({ ids: ['x', 2, null, 4] })).toEqual([2, 4]);
  });

  it('ids takes priority over id when both provided', () => {
    expect(normalizeDeleteIds({ id: 9, ids: [1, 2] })).toEqual([1, 2]);
  });
});
