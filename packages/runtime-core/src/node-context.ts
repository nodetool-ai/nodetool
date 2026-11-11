/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- NodeContext copies ProcessingContext signatures verbatim, unknowns included. Narrowing them changes the runtime contract and every node call site, which is out of scope for the interface itself. */
/**
 * The context members node code may use. `ProcessingContext` in
 * `@nodetool-ai/runtime` implements this interface, and the native runner's
 * guest context is checked against the member list generated from it
 * (`node-context-members.json`). `scripts/node-context-usage.mjs --check`
 * fails when node code uses a context member this interface does not declare.
 *
 * Members are function-typed properties rather than methods so that an
 * implementation is checked with strict parameter variance.
 */
import type {
  Entity,
  ProcessingMessage,
  ProviderCost
} from "@nodetool-ai/protocol";
import type { StorageAdapter } from "@nodetool-ai/storage";
import type {
  AssetInfoEntry,
  EntityUpsertResult,
  FolderAssetEntry,
  MessageCreateRequestLike,
  ModelInterfaceArgs,
  PersistedRecordLike,
  ProcessingContextModelInterfaces,
  ThreadMessagesResultLike
} from "./model-interfaces.js";
import type { Workspace } from "./workspace.js";

/**
 * Controls how asset-like values (ImageRef / AudioRef / VideoRef) are
 * materialized when {@link NodeContextAssets.normalizeOutputValue} runs.
 *
 * Pick the mode by where the consumer lives:
 * - `native`: in-process JS/TS code that knows how to handle the live
 *   object as-is (DSL, tests, kernel-internal handoffs). Inline `data`
 *   bytes stay attached.
 * - `data_uri`: anything that renders a `data:image/png;base64,...` URI
 *   inline (markdown, simple HTML).
 * - `temp_url`: HTTP-fetching client over a short-lived URL — bytes are
 *   uploaded to the temp storage adapter and `data` is dropped.
 * - `storage_url`: same as `temp_url` but persistent storage.
 * - `workspace`: write the bytes to a file inside `workspaceDir` and
 *   return that file URI.
 * - `raw`: keep bytes embedded in the asset's `data` field.
 *
 * NOTE: this used to be called `"python"` (mirroring the Python enum,
 * where it accurately meant "Python-native object"). The rename to
 * `"native"` makes the contract language-agnostic and matches what the
 * mode actually does in the TS runtime.
 */
export type AssetOutputMode =
  | "native"
  | "data_uri"
  | "temp_url"
  | "storage_url"
  | "workspace"
  | "raw";

/**
 * Types that `@nodetool-ai/runtime` and `@nodetool-ai/execution-core` own and
 * this package cannot import. `RuntimeNodeContextTypes` in
 * `@nodetool-ai/runtime` binds each slot to the type named in its comment, so
 * `NodeContext<RuntimeNodeContextTypes>` has the full runtime signatures.
 * Without a binding the slots are `unknown`.
 */
export interface NodeContextTypes {
  /** `BaseProvider` */
  provider: unknown;
  /** `Message` */
  message: unknown;
  /** `ProviderCapability` */
  providerCapability: string;
  /** `ProviderPredictionRequest` */
  providerRequest: unknown;
  /** `GenerationRequest` */
  generationRequest: unknown;
  /** `GenerationResult` */
  generationResult: unknown;
  /** `EncodedAudioResult` */
  encodedAudio: unknown;
  /** `EndpointProgress` */
  endpointProgress: unknown;
  /** `EndpointCallResult` */
  endpointResult: unknown;
  /** `InjectedTool` */
  injectedTool: unknown;
  /** `SandboxModuleCatalog` */
  sandboxModuleCatalog: unknown;
  /** `NodeExecutor` from `@nodetool-ai/execution-core` */
  nodeExecutor: unknown;
  /** `NodeContextCopyOptions` plus the run-trace and generation hooks */
  copyOptions: NodeContextCopyOptions;
}

/** The variable channel `getChannel` returns (`VariableChannel` in runtime). */
export interface NodeChannel<T = unknown> {
  readonly closed: boolean;
  readonly hasValue: boolean;
  send(value: T): void;
  close(): void;
  first(): Promise<T | undefined>;
  stream(): AsyncGenerator<T>;
}

/** The `copy` options that need no runtime types. */
export interface NodeContextCopyOptions {
  shareMemory?: boolean;
  inheritMessageListeners?: boolean;
  jobId?: string;
  workflowId?: string | null;
  workspace?: Workspace | null;
}

/** The node a subgraph runner asks an executor for. */
export interface NodeContextExecutorRequest {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** Type information a subgraph runner resolves for a node type. */
export interface NodeContextResolvedType {
  nodeType: string;
  propertyTypes?: Record<string, string>;
  outputs?: Record<string, string>;
  supportsDynamicInputs?: boolean;
  descriptorDefaults?: Record<string, unknown>;
}

/** Identity and lifetime of the run. */
export interface NodeContextRun<Types extends NodeContextTypes> {
  readonly jobId: string;
  readonly workflowId: string | null;
  signal: AbortSignal;
  triggerEvent: { node_id: string; payload: unknown; input_id: string } | null;
  readonly persistOutputAssets: boolean;
  readonly sandboxModuleCatalog: Types["sandboxModuleCatalog"] | null;
}

/** Secrets and user settings. */
export interface NodeContextSecrets {
  readonly getSecret: (key: string) => Promise<string | null>;
  readonly getSetting: (key: string) => Promise<string | null>;
  readonly getResolvedSecretValues: () => ReadonlySet<string>;
}

/** Run variables and the variable channels between nodes. */
export interface NodeContextVariables {
  readonly get: <T = unknown>(key: string, defaultValue?: T) => T;
  readonly set: (key: string, value: unknown) => void;
  readonly getChannel: <T = unknown>(name: string) => NodeChannel<T>;
  readonly registerChannelWriters: (name: string, count: number) => void;
  readonly markChannelWriterDone: (name: string) => void;
  readonly closeAllChannels: () => void;
  readonly hasChannelWriters: (name: string) => boolean;
}

/** Processing messages and cost accounting. */
export interface NodeContextMessages {
  readonly emit: (msg: ProcessingMessage) => void;
  readonly postMessage: (msg: ProcessingMessage) => void;
  readonly addMessageListener: (
    listener: (msg: ProcessingMessage) => void
  ) => () => void;
  readonly clearMessages: () => void;
  readonly setProviderCost: (
    provider: string,
    amount: number,
    unit: string,
    details?: Pick<
      ProviderCost,
      | "model"
      | "billing_unit"
      | "quantity"
      | "unit_price"
      | "currency"
      | "provider_request_id"
      | "input_tokens"
      | "output_tokens"
      | "cached_tokens"
    >
  ) => void;
  readonly getProviderCost: () => ProviderCost | null;
  readonly clearProviderCost: () => void;
  readonly addToTotalCost: (cost: number) => void;
  readonly getTotalCost: () => number;
}

/** Temp storage, the workspace, assets and output materialization. */
export interface NodeContextAssets {
  readonly storage: StorageAdapter | null;
  readonly workspace: Workspace | null;
  readonly workspaceDir: string | null;
  readonly createAsset: (
    args: Omit<
      ModelInterfaceArgs<"createAsset">,
      "workflowId" | "jobId" | "content"
    > & {
      content?: Uint8Array | null;
      /** Legacy name for `content`; used when `content` is absent. */
      instructions?: Uint8Array | null;
    }
  ) => Promise<unknown>;
  readonly resolveAssetBytes: (
    assetId: string,
    options?: { requireOwnedAsset?: boolean }
  ) => Promise<{ bytes: Uint8Array | null; attempts: string[] }>;
  readonly getAssetInfo: (assetId: string) => Promise<AssetInfoEntry | null>;
  readonly listFolderAssets: (
    folderId: string
  ) => Promise<FolderAssetEntry[] | null>;
  readonly localPath: (uri: string) => Promise<string | null>;
  readonly normalizeOutputValue: (
    value: unknown,
    mode?: AssetOutputMode
  ) => Promise<unknown>;
}

/** Persisted documents through the host's model interfaces. */
export interface NodeContextDocuments {
  readonly hasModelInterface: (
    name: keyof ProcessingContextModelInterfaces
  ) => boolean;
  readonly createMessage: (
    req: MessageCreateRequestLike
  ) => Promise<PersistedRecordLike>;
  readonly getThreadMessages: (
    threadId: string,
    limit?: number,
    startKey?: string | null,
    reverse?: boolean
  ) => Promise<ThreadMessagesResultLike>;
  readonly getImageDocument: (id: string) => Promise<PersistedRecordLike | null>;
  readonly createImageDocument: (
    args: ModelInterfaceArgs<"createImageDocument">
  ) => Promise<PersistedRecordLike>;
  readonly getTimelineSequence: (
    id: string
  ) => Promise<PersistedRecordLike | null>;
  readonly createTimelineSequence: (
    sequence: unknown
  ) => Promise<PersistedRecordLike>;
  readonly updateTimelineSequence: (
    id: string,
    sequence: unknown
  ) => Promise<PersistedRecordLike | null>;
  readonly getScript: (id: string) => Promise<PersistedRecordLike | null>;
  readonly createScript: (
    args: ModelInterfaceArgs<"createScript">
  ) => Promise<PersistedRecordLike>;
  readonly updateScript: (
    id: string,
    args: Omit<ModelInterfaceArgs<"updateScript">, "id">
  ) => Promise<PersistedRecordLike | null>;
  readonly getStoryboard: (id: string) => Promise<PersistedRecordLike | null>;
  readonly listStoryboards: (
    args?: ModelInterfaceArgs<"listStoryboards">
  ) => Promise<PersistedRecordLike[]>;
  readonly findRecastStoryboard: (
    args: ModelInterfaceArgs<"findRecastStoryboard">
  ) => Promise<PersistedRecordLike | null>;
  readonly createStoryboard: (
    args: ModelInterfaceArgs<"createStoryboard">
  ) => Promise<PersistedRecordLike>;
  readonly updateStoryboard: (
    id: string,
    args: Omit<ModelInterfaceArgs<"updateStoryboard">, "id">
  ) => Promise<PersistedRecordLike | null>;
  readonly listEntities: (
    args?: ModelInterfaceArgs<"listEntities">
  ) => Promise<Entity[]>;
  readonly getEntity: (id: string) => Promise<Entity | null>;
  readonly upsertEntity: (
    args: ModelInterfaceArgs<"upsertEntity">
  ) => Promise<EntityUpsertResult>;
}

/** Providers, generations and provider endpoints. */
export interface NodeContextProviders<Types extends NodeContextTypes> {
  readonly getProvider: (providerId: string) => Promise<Types["provider"]>;
  readonly runProviderPrediction: (
    req: Types["providerRequest"]
  ) => Promise<unknown>;
  readonly runGeneration: (
    req: Types["generationRequest"]
  ) => Promise<Types["generationResult"]>;
  readonly streamProviderPrediction: (
    req: Types["generationRequest"]
  ) => AsyncGenerator<unknown>;
  readonly callProviderEndpoint: (args: {
    provider: string;
    capability: Types["providerCapability"];
    model: string;
    input: Record<string, unknown>;
    route?: string;
    nodeId?: string;
    onProgress?: (event: Types["endpointProgress"]) => void;
    signal?: AbortSignal;
  }) => Promise<Types["endpointResult"]>;
  readonly uploadProviderMedia: (args: {
    provider: string;
    bytes: Uint8Array;
    mimeType: string;
    filename?: string;
    signal?: AbortSignal;
  }) => Promise<string>;
  readonly downloadProviderMedia: (args: {
    provider: string;
    url: string;
    signal?: AbortSignal;
  }) => Promise<Uint8Array>;
  readonly providerSupportsStreamingTTS: (
    providerId: string
  ) => Promise<boolean>;
  readonly textToSpeechEncoded: (
    req: Types["generationRequest"]
  ) => Promise<Types["encodedAudio"] | null>;
  readonly textToMusic: (
    req: Types["generationRequest"]
  ) => Promise<Types["encodedAudio"]>;
  readonly audioToAudio: (
    req: Types["generationRequest"]
  ) => Promise<Types["encodedAudio"]>;
  readonly resolveMessageMediaUris: (
    messages: Types["message"][]
  ) => Promise<Types["message"][]>;
}

/** Tools and control events for agent nodes. */
export interface NodeContextAgents<Types extends NodeContextTypes> {
  readonly getInjectedTool: (name: string) => Types["injectedTool"] | null;
  readonly hasControlEventSupport: boolean;
  readonly sendControlEvent: (
    targetNodeId: string,
    properties: Record<string, unknown>
  ) => Promise<Record<string, unknown> | null>;
  readonly setSendControlEvent: (
    fn: (
      targetNodeId: string,
      properties: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
  ) => void;
}

/** What a node that runs an inner graph needs to drive a nested runner. */
export interface NodeContextSubgraph<Types extends NodeContextTypes> {
  readonly copy: (opts?: Types["copyOptions"]) => NodeContext<Types>;
  readonly resolveExecutor:
    | ((node: NodeContextExecutorRequest) => Types["nodeExecutor"])
    | null;
  readonly setResolveExecutor: (
    fn: (node: NodeContextExecutorRequest) => Types["nodeExecutor"]
  ) => void;
  readonly resolveNodeType:
    | ((nodeType: string) => Promise<NodeContextResolvedType | null>)
    | null;
  readonly setResolveNodeType: (
    fn: (nodeType: string) => Promise<NodeContextResolvedType | null>
  ) => void;
}

/** Every context member node code may use, grouped by concern. */
export interface NodeContext<Types extends NodeContextTypes = NodeContextTypes>
  extends NodeContextRun<Types>,
    NodeContextSecrets,
    NodeContextVariables,
    NodeContextMessages,
    NodeContextAssets,
    NodeContextDocuments,
    NodeContextProviders<Types>,
    NodeContextAgents<Types>,
    NodeContextSubgraph<Types> {}
