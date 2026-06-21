// Core DB models
export type { Account } from './account';
export type { Message, MessageDraft } from './message';
export type { Contact, Friend, PageGroupMember, FriendRequest, Link } from './contact';

// CRM
export type {
    CRMNote, CRMCampaign, CRMCampaignContact, CRMSendLog,
    CRMTag, CRMContactTag,
    CRMCampaignStatus, CRMContactStatus, CRMCampaignType,
} from './crm';

// Facebook
export type {
    FBAccountRecord, FBAccountStatus,
    FBThread, FBThreadType, FBThreadParticipant,
    FBMessage, FBMessageType, FBMessageRecord,
    FBAttachment, FBAttachmentUploadResult,
    FBSendOptions, FBSendResult, FBSessionData, FBLoginResult,
    FBAddAccountPayload, FBSendMessagePayload,
    FBCRMContactRecord,
    FBConnectionStatus, FBReactionAction,
    FBE2EEStatus, FBE2EEBridgeConfig, FBE2EESendPayload, FBE2EESendResult, FBE2EEMessageRaw,
    FBJsonRpcRequest, FBJsonRpcResponse, FBJsonRpcEvent,
} from './facebook';

// AI
export type { AIAssistant, AIAssistantFile, ChatMessage, AIPlatform, AIUsageLog, AIAccountAssistant } from './ai';

// Employee
export type {
    Employee, EmployeePermission, EmployeeWithDetails, EmployeeModule,
    EmployeeGroup, EmployeeSession, EmployeeMessageLog,
} from './employee';
export { ALL_MODULES } from './employee';

// Proxy
export type { ProxyConfig } from './proxy';

// Workflow
export type { Workflow, WorkflowRunLog } from './workflow';

// Integration
export type { Integration } from './integration';

// ERP
export type { ErpDepartment, ErpPosition, ErpEmployeeProfile, ErpAttendance, ErpLeaveRequest } from './erp/Hrm';
export type { ErpProject, CreateProjectInput, UpdateProjectInput } from './erp/Project';
export type {
    ErpTask, ErpTaskDetail, ErpTaskDependency, ErpChecklistItem,
    ErpComment, ErpAttachment, ErpActivityLog, CreateTaskInput, UpdateTaskInput,
} from './erp/Task';
export type { ErpCalendarEvent, ErpEventAttendee, ErpEventReminder, CreateCalendarEventInput } from './erp/CalendarEvent';
export type { ErpNoteFolder, ErpNote, ErpNoteTag, ErpNoteVersion, ErpNoteShare } from './erp/Note';
export type { ErpNotification } from './erp/ErpNotification';
export type { ErpRole, ErpPermissionAction, ErpPermissionOverrideMode, ErpPermissionOverrides } from './erp/Permission';

// Automation — Group Posting Bot
export type {
    ContentPillar, ContentDraft, ImageAsset, PostSchedule, PostLog,
    DraftApprovalStatus, DraftSource, ImageAssetOrigin, PostLogStatus,
} from './automation';
