// ─── Group Posting Bot — Automation Types ────────────────────────────────────

export interface ContentPillar {
    id?: number;
    owner_zalo_id: string;
    name: string;
    description: string;
    prompt_template: string;
    tone: string;
    enabled: number; // 1 | 0
    created_at?: number;
    updated_at?: number;
}

export type DraftApprovalStatus = 'pending' | 'approved' | 'rejected' | 'posted';
export type DraftSource = 'ai' | 'manual';

export interface ContentDraft {
    id?: number;
    owner_zalo_id: string;
    pillar_id?: number | null;
    text: string;
    image_asset_id?: number | null;
    approval_status: DraftApprovalStatus;
    source: DraftSource;
    created_at?: number;
    updated_at?: number;
}

export type ImageAssetOrigin = 'upload' | 'ai';

export interface ImageAsset {
    id?: number;
    owner_zalo_id: string;
    rel_path: string; // media/{zaloId}/{date}/file
    origin: ImageAssetOrigin;
    width?: number | null;
    height?: number | null;
    created_at?: number;
}

export interface PostSchedule {
    id?: number;
    owner_zalo_id: string;
    group_ids: string; // JSON array of groupId — string at DB boundary
    posts_per_day: number; // 1..3
    window_start: string;
    window_end: string;
    enabled: number; // 1 | 0
    created_at?: number;
    updated_at?: number;
}

export type PostLogStatus = 'sent' | 'failed';

export interface PostLog {
    id?: number;
    owner_zalo_id: string;
    draft_id?: number | null;
    group_id: string;
    status: PostLogStatus;
    error?: string | null;
    posted_at: number;
}
