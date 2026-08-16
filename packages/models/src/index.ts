/**
 * @nodetool-ai/models – Database models and query utilities.
 *
 * Public API surface for the models package. Re-exports everything
 * consumers need to define, query and persist data models.
 */

import type { AdapterResolver } from "./legacy-compat.js";

// ── Database Connection ─────────────────────────────────────────────
export {
  initDb,
  initPostgresDb,
  initTestDb,
  migrateSqliteDb,
  getDb,
  getDbType,
  getRawDb,
  pingDb,
  closeDb
} from "./db.js";
export type { DbDialect } from "./db.js";

// ── Drizzle Schema (SQLite — default) ──────────────────────────────
export {
  workflows,
  jobs,
  messages,
  threads,
  threadMemories,
  assets,
  secrets,
  workspaces,
  workflowVersions,
  oauthCredentials,
  runNodeState,
  predictions,
  runEvents,
  runLeases,
  teamTasks,
  appSettings,
  timelineSequences,
  timelineSequenceVersions,
  imageDocuments,
  imageDocumentVersions,
  workerProfiles,
  workerInstances,
  triggerInputs,
  runInboxMessages,
  triggerRegistrations
} from "./schema/index.js";

// ── Drizzle Schema (PostgreSQL) ─────────────────────────────────────
export * as pgSchema from "./schema-pg/index.js";

// ── Base Model ───────────────────────────────────────────────────────
export {
  DBModel,
  ModelObserver,
  ModelChangeEvent,
  createStableUuid,
  createTimeOrderedUuid,
  computeEtag
} from "./base-model.js";
export type { ModelObserverCallback, DrizzleTable } from "./base-model.js";

// ── Domain Models ────────────────────────────────────────────────────
export { Job } from "./job.js";
export type { JobStatus } from "./job.js";

export { Workflow } from "./workflow.js";
export type {
  AccessLevel,
  WorkflowGraph,
  WorkflowSummary
} from "./workflow.js";

export { WorkflowVersion } from "./workflow-version.js";
export {
  WorkflowCollaborator,
  isCollaboratorRole,
  type CollaboratorRole
} from "./workflow-collaborator.js";
export { WorkflowShare } from "./workflow-share.js";

export { Asset } from "./asset.js";

export { Message } from "./message.js";

export { Thread } from "./thread.js";

export { ThreadMemory } from "./thread-memory.js";
export type {
  ThreadMemoryKind,
  ThreadMemoryResource
} from "./thread-memory.js";

export { Secret } from "./secret.js";
export {
  getSecret,
  getSecretRequired,
  hasSecret,
  getSecretSync,
  clearSecretCache,
  clearAllSecretCache
} from "./secret-helper.js";

export { Setting } from "./setting.js";

export {
  createWorkerProfile,
  getWorkerProfile,
  listWorkerProfiles,
  updateWorkerProfile,
  deleteWorkerProfile
} from "./worker-profiles.js";
export type {
  WorkerProfile,
  WorkerTarget,
  TokenPolicy,
  CreateWorkerProfileInput,
  WorkerProfilePatch
} from "./worker-profiles.js";

export {
  createWorkerInstance,
  getWorkerInstance,
  listWorkerInstances,
  updateWorkerInstance,
  touchWorkerInstance,
  deleteWorkerInstance
} from "./worker-instances.js";
export type {
  WorkerInstance,
  WorkerStatus,
  CreateWorkerInstanceInput,
  WorkerInstancePatch,
  ListWorkerInstancesOptions
} from "./worker-instances.js";

export {
  TimelineSequence,
  TimelineSequenceConflictError
} from "./timeline-sequence.js";
export type {
  TimelineDocument,
  TimelineSequenceMutationResult
} from "./timeline-sequence.js";

export { TimelineSequenceVersion } from "./timeline-sequence-version.js";
export type { TimelineSequenceSaveType } from "./timeline-sequence-version.js";

export { ImageDocument, ImageDocumentConflictError } from "./image-document.js";
export { ImageDocumentVersion } from "./image-document-version.js";
export type { ImageDocumentSaveType } from "./image-document-version.js";
export {
  Storyboard,
  StoryboardConflictError,
  emptyStoryboardDocument
} from "./storyboard.js";
export type { StoryboardDocument, StoryboardResponse } from "./storyboard.js";
export {
  Application,
  ApplicationConflictError,
  ApplicationIdInUseError,
  InvalidApplicationIdError,
  normalizeApplicationId,
  deriveCapabilities,
  publishApplication,
  listApplicationVersions,
  releasedApplicationVersion,
  releasedApplicationRelease,
  releaseApplicationVersion
} from "./application.js";
export type {
  ApplicationCapabilities,
  ApplicationReleaseResponse,
  ApplicationResponse,
  ApplicationVersionResponse,
  PinnedWorkflow
} from "./application.js";
export {
  applicationUsage,
  checkApplicationBudget,
  getApplicationBudget,
  listInvocations,
  periodStart,
  recordInvocation,
  reserveInvocation,
  setApplicationBudget,
  settleInvocation
} from "./application-budget.js";
export type {
  ApplicationBudget,
  ApplicationUsage,
  BudgetDecision,
  BudgetPeriod,
  InvocationRecord,
  Reservation,
  ReserveInput
} from "./application-budget.js";
export {
  Script,
  ScriptConflictError,
  emptyScriptDocument,
  countScriptLines
} from "./script.js";
export { JsScript, JsScriptConflictError } from "./js-script.js";
export type { JsScriptResponse } from "./js-script.js";
export { JsScriptVersion } from "./js-script-version.js";
export type { JsScriptSaveType } from "./js-script-version.js";
export { createJsScriptResolver } from "./js-script-resolver.js";
export type {
  ScriptDocument,
  ScriptResponse,
  ScriptSection,
  ScriptLine,
  ScriptTake,
  ScriptSpeaker,
  VoiceBinding as ScriptVoiceBinding,
  ScriptCaptionWord
} from "./script.js";
export type {
  ImageDocumentData,
  ImageDocumentMutationResult,
  ImageDocumentResponse
} from "./image-document.js";

export { OAuthCredential } from "./oauth-credential.js";
export { resolveCodexAccessToken } from "./codex-token.js";
export {
  GOOGLE_ACCESS_TOKEN_KEY,
  GOOGLE_CREDENTIAL_PROVIDER,
  resolveGoogleAccessToken,
  getGoogleGrantedScopes,
  storeGoogleCredential,
  deleteGoogleCredentials
} from "./google-token.js";

export { Prediction } from "./prediction.js";
export type {
  AggregateResult,
  ProviderAggregateResult,
  ModelAggregateResult
} from "./prediction.js";

export { Workspace } from "./workspace.js";

export { RunNodeState } from "./run-node-state.js";
export type { NodeStatus } from "./run-node-state.js";

export { RunEvent } from "./run-event.js";
export type { EventType } from "./run-event.js";

export { RunLease } from "./run-lease.js";

export { TriggerInput } from "./trigger-input.js";
export { RunInboxMessage } from "./run-inbox-message.js";
export { TriggerRegistration } from "./trigger-registration.js";

// ── Seeds ────────────────────────────────────────────────────────────
export { runSeeds, seedCostData, COST_SEED_USER_ID } from "./seeds/index.js";

// ── API Graph ───────────────────────────────────────────────────────
export {
  toApiNode,
  toApiEdge,
  toApiGraph,
  removeConnectedSlots
} from "./api-graph.js";
export type { ApiNode, ApiEdge, ApiGraph } from "./api-graph.js";

// ── Migrations (transition period — will be removed) ────────────────
export {
  MigrationError,
  LockError,
  ChecksumError,
  BaselineError,
  MigrationDiscoveryError,
  RollbackError,
  DatabaseState,
  APPLICATION_TABLES,
  MIGRATION_TRACKING_TABLE,
  MIGRATION_LOCK_TABLE,
  detectDatabaseState,
  SQLiteMigrationAdapter,
  PostgresMigrationAdapter,
  PostgresJsMigrationAdapter,
  migrations,
  MigrationRunner
} from "./migrations/index.js";
export type {
  MigrationDBAdapter,
  SqlParams,
  Row as MigrationRow,
  MigrationDef,
  Migration,
  AppliedMigration,
  MigrationStatus
} from "./migrations/index.js";

// ── Legacy Compatibility (deprecated — will be removed) ─────────────
// These re-exports allow existing consumer code to keep compiling during
// the transition. They are no-ops or thin wrappers.
export { MemoryAdapterFactory, MemoryAdapter } from "./memory-adapter.js";
export { SQLiteAdapter, SQLiteAdapterFactory } from "./sqlite-adapter.js";
export type {
  DatabaseAdapter,
  TableSchema,
  FieldDef,
  IndexDef,
  Row
} from "./database-adapter.js";
export {
  Operator,
  LogicalOperator,
  Variable,
  Condition,
  ConditionGroup,
  Field,
  ConditionBuilder,
  field
} from "./condition-builder.js";
export type { ConditionValue } from "./condition-builder.js";

// Legacy adapter resolver — now a no-op since models use getDb() directly.
// Kept for API compatibility during transition.
let _legacyResolver: AdapterResolver | null = null;
export function setGlobalAdapterResolver(resolver: AdapterResolver): void {
  _legacyResolver = resolver;
}
export function getGlobalAdapterResolver(): AdapterResolver | null {
  return _legacyResolver;
}

// Legacy types kept for API compat
export type { IndexSpec } from "./legacy-compat.js";
export type { ModelClass, AdapterResolver } from "./legacy-compat.js";
export {
  CREDIT_PLANS,
  DEFAULT_PLAN_ID,
  USD_PER_CREDIT,
  checkCredits,
  creditStatus,
  ensureMonthlyGrant,
  getSubscription,
  grantCredits,
  periodKeyFor,
  planById,
  setSubscriptionPlan
} from "./credits.js";
export type {
  CreditDecision,
  CreditPlan,
  CreditStatus,
  UserSubscription
} from "./credits.js";
