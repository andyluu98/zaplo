import { create } from 'zustand';
import type { ContentPillar, ContentDraft, ImageAsset, ImageFolder, PostSchedule, PostLog } from '@/../../src/models/automation';

// ─── Zalo Group (from posting:groups.list) ────────────────────────────────────

export interface ZaloGroup {
  groupId: string;
  name: string;
  avatar: string;
}

// ─── Bot status shape (from posting:bot.status) ───────────────────────────────

export interface BotStatus {
  running: boolean;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  pendingDrafts?: number;
}

// ─── Store shape ──────────────────────────────────────────────────────────────

interface PostingState {
  currentZaloId: string | null;
  pillars: ContentPillar[];
  drafts: ContentDraft[];
  targetGroups: ZaloGroup[];
  schedule: PostSchedule | null;
  imageLibrary: ImageAsset[];
  folders: ImageFolder[];
  currentFolderId: number | null | 'all';
  postLogs: PostLog[];
  botStatus: BotStatus | null;

  // Loading flags per slice
  loadingPillars: boolean;
  loadingDrafts: boolean;
  loadingGroups: boolean;
  loadingSchedule: boolean;
  loadingImages: boolean;
  loadingLogs: boolean;
  loadingBotStatus: boolean;
}

interface PostingActions {
  setCurrentZaloId: (zaloId: string | null) => void;
  /** Clear all slices — call on account switch to avoid stale cross-account data */
  clearAll: () => void;

  // Pillar actions
  setPillars: (pillars: ContentPillar[]) => void;
  upsertPillar: (pillar: ContentPillar) => void;
  removePillar: (id: number) => void;
  setLoadingPillars: (v: boolean) => void;

  // Draft actions
  setDrafts: (drafts: ContentDraft[]) => void;
  upsertDraft: (draft: ContentDraft) => void;
  removeDraft: (id: number) => void;
  setLoadingDrafts: (v: boolean) => void;

  // Group actions
  setTargetGroups: (groups: ZaloGroup[]) => void;
  setLoadingGroups: (v: boolean) => void;

  // Schedule actions
  setSchedule: (schedule: PostSchedule | null) => void;
  setLoadingSchedule: (v: boolean) => void;

  // Image library actions
  setImageLibrary: (assets: ImageAsset[]) => void;
  upsertImage: (asset: ImageAsset) => void;
  removeImage: (id: number) => void;
  setLoadingImages: (v: boolean) => void;

  // Folder actions
  setFolders: (folders: ImageFolder[]) => void;
  setCurrentFolderId: (id: number | null | 'all') => void;

  // Log actions
  setPostLogs: (logs: PostLog[]) => void;
  setLoadingLogs: (v: boolean) => void;

  // Bot status
  setBotStatus: (status: BotStatus | null) => void;
  setLoadingBotStatus: (v: boolean) => void;
}

const EMPTY_STATE: PostingState = {
  currentZaloId: null,
  pillars: [],
  drafts: [],
  targetGroups: [],
  schedule: null,
  imageLibrary: [],
  folders: [],
  currentFolderId: 'all',
  postLogs: [],
  botStatus: null,
  loadingPillars: false,
  loadingDrafts: false,
  loadingGroups: false,
  loadingSchedule: false,
  loadingImages: false,
  loadingLogs: false,
  loadingBotStatus: false,
};

export const usePostingStore = create<PostingState & PostingActions>((set, get) => ({
  ...EMPTY_STATE,

  setCurrentZaloId: (zaloId) => set({ currentZaloId: zaloId }),

  clearAll: () => set({ ...EMPTY_STATE, currentZaloId: get().currentZaloId }),

  // Pillars
  setPillars: (pillars) => set({ pillars }),
  upsertPillar: (pillar) => set((s) => {
    const exists = pillar.id != null && s.pillars.some(p => p.id === pillar.id);
    return {
      pillars: exists
        ? s.pillars.map(p => p.id === pillar.id ? { ...p, ...pillar } : p)
        : [...s.pillars, pillar],
    };
  }),
  removePillar: (id) => set((s) => ({ pillars: s.pillars.filter(p => p.id !== id) })),
  setLoadingPillars: (v) => set({ loadingPillars: v }),

  // Drafts
  setDrafts: (drafts) => set({ drafts }),
  upsertDraft: (draft) => set((s) => {
    const exists = draft.id != null && s.drafts.some(d => d.id === draft.id);
    return {
      drafts: exists
        ? s.drafts.map(d => d.id === draft.id ? { ...d, ...draft } : d)
        : [...s.drafts, draft],
    };
  }),
  removeDraft: (id) => set((s) => ({ drafts: s.drafts.filter(d => d.id !== id) })),
  setLoadingDrafts: (v) => set({ loadingDrafts: v }),

  // Groups
  setTargetGroups: (groups) => set({ targetGroups: groups }),
  setLoadingGroups: (v) => set({ loadingGroups: v }),

  // Schedule
  setSchedule: (schedule) => set({ schedule }),
  setLoadingSchedule: (v) => set({ loadingSchedule: v }),

  // Image library
  setImageLibrary: (assets) => set({ imageLibrary: assets }),
  upsertImage: (asset) => set((s) => {
    const exists = asset.id != null && s.imageLibrary.some(a => a.id === asset.id);
    return {
      imageLibrary: exists
        ? s.imageLibrary.map(a => a.id === asset.id ? { ...a, ...asset } : a)
        : [...s.imageLibrary, asset],
    };
  }),
  removeImage: (id) => set((s) => ({ imageLibrary: s.imageLibrary.filter(a => a.id !== id) })),
  setLoadingImages: (v) => set({ loadingImages: v }),

  // Folders
  setFolders: (folders) => set({ folders }),
  setCurrentFolderId: (id) => set({ currentFolderId: id }),

  // Post logs
  setPostLogs: (logs) => set({ postLogs: logs }),
  setLoadingLogs: (v) => set({ loadingLogs: v }),

  // Bot status
  setBotStatus: (botStatus) => set({ botStatus }),
  setLoadingBotStatus: (v) => set({ loadingBotStatus: v }),
}));
