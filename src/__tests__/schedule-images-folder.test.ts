/**
 * schedule-images-folder.test.ts
 * Unit test: imagesForItem trong schedule-runner.
 * - item.image_folder_id set → lấy từ DB.getImages + pickFolderImages
 * - item.image_folder_id null/undefined → fallback randomImages (query raw)
 */

import type { ImageAsset } from '../models/automation';

// ── mock DatabaseService ─────────────────────────────────────────────────────
const mockGetImages = jest.fn<ImageAsset[], [string, number]>();
const mockQuery = jest.fn<any[], [string, any[]]>();
jest.mock('../services/database/DatabaseService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getImages: mockGetImages,
      query: mockQuery,
    }),
  },
}));

// ── mock FB / Zalo / Logger deps để module load không throw ─────────────────
jest.mock('../services/facebook/FacebookSendService', () => ({ FacebookSendService: {} }));
jest.mock('../services/facebook/FacebookSession', () => ({ initSession: jest.fn() }));
jest.mock('../services/facebook/write/facebook-write-service', () => ({ sendMutation: jest.fn() }));
jest.mock('../services/facebook/write/facebook-write-variables', () => ({ buildStoryVariables: jest.fn() }));
jest.mock('../services/facebook/write/facebook-photo-upload', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../services/facebook/write/facebook-write-doc-ids', () => ({ FB_WRITE_DOC_IDS: {} }));
jest.mock('../services/file/FileStorageService', () => ({
  __esModule: true,
  default: { resolveAbsolutePath: (r: string) => `/abs/${r}` },
}));
jest.mock('../utils/ConnectionManager', () => ({ default: { getConnection: jest.fn() } }));
jest.mock('../services/posting/posting-sender', () => ({ sendDraftToGroup: jest.fn() }));
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { imagesForItem } from '../services/schedule/schedule-runner';

// ── helpers ──────────────────────────────────────────────────────────────────
const mkAssets = (n: number): ImageAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    owner_zalo_id: 'z1',
    rel_path: `img/${i + 1}.jpg`,
    origin: 'upload' as const,
  }));

beforeEach(() => jest.clearAllMocks());

// ── tests ────────────────────────────────────────────────────────────────────

test('image_folder_id set → gọi getImages và trả rel_path từ folder (fixed)', () => {
  mockGetImages.mockReturnValue(mkAssets(5));

  const item = { image_folder_id: 3, image_count: 2, image_random: false };
  const paths = imagesForItem('z1', item);

  expect(mockGetImages).toHaveBeenCalledWith('z1', 3);
  expect(mockQuery).not.toHaveBeenCalled();
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe('img/1.jpg');
});

test('image_folder_id set + image_random=true → 1..image_count ảnh', () => {
  mockGetImages.mockReturnValue(mkAssets(5));

  const item = { image_folder_id: 3, image_count: 4, image_random: true };
  const paths = imagesForItem('z1', item);

  expect(mockGetImages).toHaveBeenCalledWith('z1', 3);
  expect(paths.length).toBeGreaterThanOrEqual(1);
  expect(paths.length).toBeLessThanOrEqual(4);
  paths.forEach(p => expect(p).toMatch(/^img\/\d+\.jpg$/));
});

test('image_folder_id set, folder rỗng → []', () => {
  mockGetImages.mockReturnValue([]);

  const paths = imagesForItem('z1', { image_folder_id: 9, image_count: 3, image_random: false });

  expect(paths).toEqual([]);
});

test('image_folder_id null → fallback randomImages (query DB)', () => {
  mockQuery.mockReturnValue([{ rel_path: 'img/a.jpg' }, { rel_path: 'img/b.jpg' }]);

  const paths = imagesForItem('z1', { image_folder_id: null, image_count: 2, image_random: false });

  expect(mockGetImages).not.toHaveBeenCalled();
  expect(mockQuery).toHaveBeenCalled();
  expect(paths).toEqual(['img/a.jpg', 'img/b.jpg']);
});

test('image_folder_id undefined → fallback randomImages', () => {
  mockQuery.mockReturnValue([{ rel_path: 'img/x.jpg' }]);

  const paths = imagesForItem('z1', { image_count: 1 });

  expect(mockGetImages).not.toHaveBeenCalled();
  expect(paths).toEqual(['img/x.jpg']);
});

test('image_count=0, no folder → [] (không query)', () => {
  const paths = imagesForItem('z1', { image_count: 0 });

  expect(mockQuery).not.toHaveBeenCalled();
  expect(paths).toEqual([]);
});
