/**
 * facebook-write-variables.ts
 * Dựng object `variables` GraphQL cho từng loại hành động GHI.
 * Tách riêng khỏi IPC để dễ cập nhật khi FB đổi schema (chỉ sửa 1 nơi).
 *
 * Cấu trúc lấy từ request thật quan sát qua DevTools (xem facebook-write-doc-ids.ts).
 * Bỏ trường analytics không bắt buộc (attribution_id_v2, tracking) để payload tối giản, bền.
 */

import { generateClientId } from '../FacebookUtils';
import type { WriteActionType, WriteBatchItem } from './facebook-write-types';

// ─── Comment ────────────────────────────────────────────────────────────────

/** Cờ relay provider FB yêu cầu cho comment mutation. */
const COMMENT_RELAY_PROVIDERS = {
  __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
  __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
};

/**
 * Encode feedback_id mà comment cần: base64 của `feedback:<số>`.
 * Số → encode; chuỗi base64 sẵn → giữ nguyên.
 */
export function encodeFeedbackId(target: string): string {
  const t = String(target || '').trim();
  if (/^\d+$/.test(t)) return Buffer.from(`feedback:${t}`).toString('base64');
  return t;
}

/** Variables cho comment vào bài. */
export function buildCommentVariables(feedbackTarget: string, text: string): Record<string, any> {
  return {
    feedLocation: 'POST_PERMALINK_DIALOG',
    feedbackSource: 2,
    groupID: null,
    input: {
      client_mutation_id: '1',
      attachments: null,
      feedback_id: encodeFeedbackId(feedbackTarget),
      formatting_style: null,
      message: { ranges: [], text },
      vod_video_timestamp: null,
      is_tracking_encrypted: false,
      feedback_source: 'OBJECT',
      idempotence_token: `client:${generateClientId()}`,
      session_id: generateClientId(),
    },
    scale: 1,
    useDefaultActor: false,
    focusCommentID: null,
    translationType: 'ORIGINAL',
    canUseNicknameOnComet: false,
    ...COMMENT_RELAY_PROVIDERS,
  };
}

// ─── Story (đăng bài: tường cá nhân + nhóm, CHUNG mutation) ───────────────────

/** Cờ relay provider FB yêu cầu cho ComposerStoryCreateMutation. */
const STORY_RELAY_PROVIDERS = {
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
  __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: true,
  __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__CometUFISingleLineUFIrelayprovider: false,
  __relay_internal__pv__CometFeedStory_enable_reactor_facepilerelayprovider: false,
  __relay_internal__pv__CometFeedStory_enable_social_bubblesrelayprovider: false,
  __relay_internal__pv__CometFeedStory_enable_post_permalink_white_space_clickrelayprovider: false,
  __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
  __relay_internal__pv__CometFeedShareMedia_shouldPrefetchShareImagerelayprovider: false,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__relay_provider_comet_ufi_ssr_seo_deferrelayprovider: true,
  __relay_internal__pv__ReelsIFUCard_reelsIFULikeCountrelayprovider: false,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
  __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
  __relay_internal__pv__ShouldEnableBakedInTextStoriesrelayprovider: false,
  __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
  __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: true,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false,
};

export interface StoryOpts {
  /** Có giá trị → đăng vào nhóm (audience.to_id). Rỗng → đăng tường cá nhân. */
  groupId?: string;
  /** id ảnh đã upload (P2/P3) → attachments. */
  photoIds?: string[];
  /** Quyền riêng tư bài tường cá nhân: EVERYONE | FRIENDS | SELF. Mặc định EVERYONE. */
  privacy?: 'EVERYONE' | 'FRIENDS' | 'SELF';
}

/** Variables cho đăng bài (tường cá nhân hoặc nhóm) — chung ComposerStoryCreateMutation. */
export function buildStoryVariables(text: string, fbId: string, opts: StoryOpts = {}): Record<string, any> {
  const isGroup = !!opts.groupId;
  const sessionId = generateClientId();
  const attachments = (opts.photoIds || []).map(id => ({ photo: { id } }));

  const input: Record<string, any> = {
    composer_entry_point: 'inline_composer',
    composer_source_surface: isGroup ? 'group' : 'timeline',
    idempotence_token: `${generateClientId()}_FEED`,
    source: 'WWW',
    message: { ranges: [], text },
    with_tags_ids: null,
    inline_activities: [],
    text_format_preset_id: '0',
    logging: { composer_session_id: sessionId },
    tracking: [null],
    actor_id: fbId,
    client_mutation_id: '1',
    ...(attachments.length ? { attachments } : {}),
  };

  if (isGroup) {
    input.composer_type = 'group';
    input.group_flair = { flair_id: null };
    input.composed_text = {
      block_data: ['{}'], block_depths: [0], block_types: [0],
      blocks: [text], entities: ['[]'], entity_map: '{}', inline_styles: ['[]'],
    };
    input.event_share_metadata = { surface: 'newsfeed' };
    input.audience = { to_id: opts.groupId };
  } else {
    input.publishing_flow = { supported_flows: ['ASYNC_SILENT', 'ASYNC_NOTIF', 'FALLBACK'] };
    input.post_publish_story_data = { reshare_post_as_sticker: 'DISABLED' };
    input.event_share_metadata = { surface: 'timeline' };
    input.audience = { privacy: { allow: [], base_state: opts.privacy || 'EVERYONE', deny: [], tag_expansion_state: 'UNSPECIFIED' } };
  }

  return {
    input,
    feedLocation: isGroup ? 'GROUP' : 'TIMELINE',
    feedbackSource: 0,
    focusCommentID: null,
    gridMediaWidth: isGroup ? null : 230,
    groupID: null,
    scale: 1,
    privacySelectorRenderLocation: 'COMET_STREAM',
    checkPhotosToReelsUpsellEligibility: !isGroup,
    referringStoryRenderLocation: null,
    renderLocation: isGroup ? 'group' : 'timeline',
    useDefaultActor: false,
    inviteShortLinkKey: null,
    isFeed: false, isFundraiser: false, isFunFactPost: false,
    isGroup, isEvent: false, isTimeline: !isGroup,
    isSocialLearning: false, isPageNewsFeed: false, isProfileReviews: false, isWorkSharedDraft: false,
    ...STORY_RELAY_PROVIDERS,
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export function buildVariables(item: WriteBatchItem, fbId: string): Record<string, any> {
  switch (item.actionType as WriteActionType) {
    case 'comment':       return buildCommentVariables(item.target, item.content);
    case 'post_personal': return buildStoryVariables(item.content, fbId, {});
    case 'post_group':    return buildStoryVariables(item.content, fbId, { groupId: item.target });
    default:              return { input: { message: { text: item.content }, actor_id: fbId } };
  }
}
