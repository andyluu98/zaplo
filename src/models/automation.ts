// ─── Group Posting Bot — Automation Types ────────────────────────────────────

export interface ContentPillar {
    id?: number;
    owner_zalo_id: string;
    name: string;
    description: string;
    prompt_template: string;
    tone: string;
    enabled: number; // 1 | 0
    assistant_id?: string | null; // AI assistant used to generate drafts for this pillar ('' = default)
    created_at?: number;
    updated_at?: number;
}

export type DraftApprovalStatus = 'pending' | 'approved' | 'rejected' | 'posted';
export type DraftSource = 'ai' | 'manual';

export interface ContentDraft {
    id?: number;
    owner_zalo_id: string;
    pillar_id?: number | null;
    agent_id?: number | null;     // which posting agent owns this draft
    text: string;
    image_asset_id?: number | null;
    approval_status: DraftApprovalStatus;
    source: DraftSource;
    scheduled_at?: number | null; // planned post time (epoch ms), null = queue/FIFO
    created_at?: number;
    updated_at?: number;
}

// ─── Posting Agent (agent-centric module) ────────────────────────────────────

export type AgentApprovalMode = 'auto' | 'manual';
export type AgentImageMode = 'auto' | 'fixed' | 'none';

export interface PostingAgent {
    id?: number;
    owner_zalo_id: string;        // 1 agent = 1 Zalo account
    name: string;
    assistant_id?: string | null; // AI assistant (prompt+API); '' = default
    enabled: number;              // 1 | 0
    approval_mode: AgentApprovalMode;
    image_mode: AgentImageMode;
    image_count: number;          // for image_mode='auto' (e.g. 2-3)
    created_at?: number;
    updated_at?: number;
    // joined (not stored on the row):
    pillar_ids?: number[];
    group_ids?: string[];
    fixed_image_ids?: number[];
    schedules?: AgentSchedule[];
}

export type AgentScheduleKind = 'daily' | 'weekly' | 'monthly' | 'once';

export interface AgentSchedule {
    id?: number;
    agent_id: number;
    kind: AgentScheduleKind;
    weekdays?: string | null;     // CSV "1,3,5" (1=Mon..7=Sun) for weekly
    month_days?: string | null;   // CSV "1,15" for monthly
    date?: string | null;         // "YYYY-MM-DD" for once
    time?: string | null;         // "HH:MM" for once
    window_start: string;         // "HH:MM" for recurring
    window_end: string;           // "HH:MM" for recurring
    posts_per_day: number;
    enabled: number;              // 1 | 0
}

// ─── Chat Agent (auto-reply agent-centric module) ────────────────────────────

export type ChatReplyMode = 'auto' | 'suggest';

export interface ChatAgent {
    id?: number;
    owner_zalo_id: string;        // 1 agent = 1 Zalo account
    name: string;
    assistant_id?: string | null; // AI assistant (prompt+API); '' = default
    enabled: number;              // 1 | 0
    reply_mode: ChatReplyMode;    // 'auto' = send directly, 'suggest' = draft only
    is_default: number;           // 1 = fallback agent for this account
    default_scope_dm: number;          // 1 = covers direct messages (used when is_default)
    default_scope_group: number;       // 1 = covers group threads (used when is_default)
    default_stranger_only: number;     // 1 = only reply to non-friends (used when is_default)
    autopause_on_human: number;        // 1 = pause AI when a human replies
    autoresume_minutes: number;        // minutes of human silence before AI resumes (0 = never)
    allow_manual_toggle: number;       // 1 = user may pause/resume per conversation
    trigger_keywords?: string;         // CSV; in groups reply only on @mention or these keywords
    created_at?: number;
    updated_at?: number;
    // joined (not stored on the row):
    thread_ids?: string[];
    label_ids?: number[];
}

export interface ConversationAiState {
    owner_zalo_id: string;
    thread_id: string;
    paused: number;               // 1 | 0
    paused_reason?: string | null;
    paused_at?: number | null;
    pinned_agent_id?: number | null; // forces this thread to a specific chat agent
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
    agent_id?: number | null;   // which agent posted (for per-agent stats)
    draft_id?: number | null;
    group_id: string;
    status: PostLogStatus;
    error?: string | null;
    posted_at: number;
}
