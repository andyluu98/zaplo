/**
 * posting-sender-folder.test.ts
 * Unit test: resolveAgentImagePaths với image_mode='folder'.
 * Mock DatabaseService + FileStorageService → không gọi DB/file thật.
 */

import type { ImageAsset } from '../models/automation';

// ── mock DatabaseService ─────────────────────────────────────────────────────
const mockGetImages = jest.fn<ImageAsset[], [string, number | null | undefined]>();
const mockGetImageAssets = jest.fn(() => [] as ImageAsset[]);
jest.mock('../services/database/DatabaseService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getImages: mockGetImages,
      getImageAssets: mockGetImageAssets,
    }),
  },
}));

// ── mock FileStorageService ──────────────────────────────────────────────────
jest.mock('../services/file/FileStorageService', () => ({
  __esModule: true,
  default: {
    resolveAbsolutePath: (rel: string) => `/abs/${rel}`,
  },
}));

import { resolveAgentImagePaths } from '../services/posting/posting-sender';
import type { PostingAgent, ContentDraft } from '../models';

// ── helpers ──────────────────────────────────────────────────────────────────
const mkAssets = (n: number): ImageAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    owner_zalo_id: 'z1',
    rel_path: `images/${i + 1}.jpg`,
    origin: 'upload' as const,
  }));

const baseAgent: PostingAgent = {
  id: 1,
  owner_zalo_id: 'z1',
  name: 'Test agent',
  enabled: 1,
  group_ids: [],
  image_mode: 'folder',
  image_count: 3,
  image_folder_id: 7,
  image_count_random: false,
  fixed_image_ids: [],
  approval_mode: 'auto',
  created_at: 0,
};

const baseDraft: ContentDraft = {
  id: 1,
  owner_zalo_id: 'z1',
  text: 'hello',
  approval_status: 'pending',
  source: 'manual',
  created_at: 0,
};

// ── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

test('image_mode=folder: gọi getImages(zaloId, folderId) → trả đúng đường dẫn', () => {
  const assets = mkAssets(5);
  mockGetImages.mockReturnValue(assets);

  const paths = resolveAgentImagePaths('z1', { ...baseAgent, image_count: 3, image_count_random: false }, baseDraft);

  expect(mockGetImages).toHaveBeenCalledWith('z1', 7);
  // fixed mode: lấy 3 ảnh đầu
  expect(paths).toHaveLength(3);
  expect(paths[0]).toBe('/abs/images/1.jpg');
});

test('image_mode=folder random: trả 1..image_count ảnh trong folder', () => {
  mockGetImages.mockReturnValue(mkAssets(5));

  const paths = resolveAgentImagePaths('z1', { ...baseAgent, image_count: 4, image_count_random: true }, baseDraft);

  expect(mockGetImages).toHaveBeenCalledWith('z1', 7);
  expect(paths.length).toBeGreaterThanOrEqual(1);
  expect(paths.length).toBeLessThanOrEqual(4);
});

test('image_mode=folder folder rỗng → []', () => {
  mockGetImages.mockReturnValue([]);

  const paths = resolveAgentImagePaths('z1', baseAgent, baseDraft);

  expect(paths).toEqual([]);
  expect(mockGetImages).toHaveBeenCalledWith('z1', 7);
});

test('image_mode=none → [] (không gọi getImages)', () => {
  const paths = resolveAgentImagePaths('z1', { ...baseAgent, image_mode: 'none' }, baseDraft);

  expect(paths).toEqual([]);
  expect(mockGetImages).not.toHaveBeenCalled();
});

test('image_mode=auto → dùng getImageAssets (không gọi getImages)', () => {
  const assets = mkAssets(4);
  mockGetImageAssets.mockReturnValue(assets);

  resolveAgentImagePaths('z1', { ...baseAgent, image_mode: 'auto', image_count: 2 }, baseDraft);

  expect(mockGetImages).not.toHaveBeenCalled();
  expect(mockGetImageAssets).toHaveBeenCalled();
});

test('image_mode=fixed → dùng getImageAssets (không gọi getImages)', () => {
  const assets = mkAssets(4);
  mockGetImageAssets.mockReturnValue(assets);

  resolveAgentImagePaths('z1', { ...baseAgent, image_mode: 'fixed', fixed_image_ids: [1, 3] }, baseDraft);

  expect(mockGetImages).not.toHaveBeenCalled();
  expect(mockGetImageAssets).toHaveBeenCalled();
});
