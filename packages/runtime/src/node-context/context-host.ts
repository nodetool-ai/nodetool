/**
 * The host interfaces of the shared context logic in this directory.
 *
 * Each module here implements `NodeContext` members (see
 * `@nodetool-ai/runtime-core`) as functions over one of these interfaces.
 * `ProcessingContext` passes itself, or an adapter over its private state,
 * and delegates to them. The native runner's guest context bundles the same
 * modules and passes its own context over `globalThis.__host`. The interfaces
 * name only primitives a host has to supply: reading stored bytes, resolving
 * a provider, emitting a message, creating an asset.
 *
 * The modules must run in QuickJS: no Node builtins, no file system, no
 * `process`, and no side effects at load time.
 */
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { GenerationLifecycleHooks } from "../context.js";
import type { GenerationOutcome } from "../generation-registry.js";
import type { EntityRefResolver } from "../prompt-asset-refs.js";
import type { BaseProvider } from "../providers/base-provider.js";
import type { Message } from "../providers/types.js";

/** A store that returns the bytes behind a storage URI, or null. */
export interface MediaStore {
  retrieve(uri: string): Promise<Uint8Array | null>;
}

/**
 * Reads the media a message or a request references: asset references
 * through `resolveAssetBytes`, other storage URIs through the asset and temp
 * stores, and entity descriptions through `getAssetInfo`.
 */
export interface MediaHost extends EntityRefResolver {
  readonly assetStorage: MediaStore | null;
  readonly storage: MediaStore | null;
  resolveAssetBytes(assetId: string): Promise<{ bytes: Uint8Array | null }>;
}

/** Resolves a provider by id, through whatever grants the host has. */
export interface ProviderHost {
  getProvider(providerId: string): Promise<BaseProvider>;
}

/** What a provider call needs beyond the provider: media and the run signal. */
export interface ProviderCallHost extends MediaHost {
  readonly signal: AbortSignal;
  resolveMessageMediaUris(messages: Message[]): Promise<Message[]>;
}

/** Arguments of the asset a generation saves its output as. */
export interface GenerationAssetArgs {
  name: string;
  contentType: string;
  content: Uint8Array;
  parentId: string | null;
  nodeId: string | null;
  metadata: Record<string, unknown>;
}

/** The run a generation belongs to, as the generation envelope reads it. */
export interface GenerationContext extends ProviderCallHost, ProviderHost {
  readonly userId: string;
  readonly jobId: string;
  readonly workflowId: string | null;
  readonly threadId: string | null;
  emit(message: ProcessingMessage): void;
  hasModelInterface(name: "createAsset"): boolean;
  createAsset(args: GenerationAssetArgs): Promise<unknown>;
}

/** The part of the generation registry the envelope reports to. */
export interface GenerationRegistryPort {
  register(id: string, entry: { userId: string; abort: () => void }): void;
  settle(id: string, outcome: GenerationOutcome): void;
}

/**
 * The host of the generation envelope (`generation.ts`): the run, plus the
 * host-owned bookkeeping a TypeScript server installs and the native runner
 * does not have.
 */
export interface GenerationHost {
  readonly context: GenerationContext;
  /** Durable lifecycle callbacks, or null for an ephemeral run. */
  readonly lifecycle: GenerationLifecycleHooks | null;
  /** The live generations a `cancel_generation` call can abort. */
  readonly registry: GenerationRegistryPort;
  /** True inside an app run, whose ledger records a failed generation too. */
  insideAppRun(): boolean;
}
