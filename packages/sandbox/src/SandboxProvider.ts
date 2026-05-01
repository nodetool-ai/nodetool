/**
 * SandboxProvider — abstract contract for isolated computer environments.
 *
 * A sandbox is a long-lived, network-reachable environment the agent drives
 * via a tool client. Implementations may be Docker (current), gVisor,
 * Firecracker, or a managed sandbox API (E2B, Daytona, Modal).
 *
 * Lifecycle:
 *   acquire() → sandbox running and reachable
 *   client()  → ToolClient for calling tools inside it
 *   release() → stopped and removed; workspace may persist via TTL
 *
 * Pause/resume are optional optimizations for warm pools.
 */

import type { ToolClient } from "./ToolClient.js";

export interface SandboxOptions {
  /** Stable identifier used for workspace volume and container name. */
  sessionId: string;
  /** Host directory bind-mounted at /workspace inside the sandbox. */
  workspaceDir?: string;
  /** Max lifetime in seconds; 0 = no limit. Default: 3600. */
  timeoutSeconds?: number;
  /** Docker memory limit (e.g. "2g"). */
  memLimit?: string;
  /** Nano CPUs (1e9 = 1 CPU). */
  nanoCpus?: number;
  /** Override default sandbox image. */
  image?: string;
  /** Extra env vars injected into the container. */
  env?: Record<string, string>;
}

export interface SandboxEndpoint {
  /** http://host:port URL of the in-container tool server. */
  toolUrl: string;
  /** ws://host:port URL of the VNC viewer (if desktop enabled). */
  vncUrl?: string;
}

export interface Sandbox {
  readonly sessionId: string;
  readonly endpoint: SandboxEndpoint;
  readonly client: ToolClient;
  /** Stop and delete the sandbox. */
  release(): Promise<void>;
  /** Pause execution; memory retained. Optional. */
  pause?(): Promise<void>;
  /** Resume from paused state. Optional. */
  resume?(): Promise<void>;
}

export interface SandboxProvider {
  /** Create and start a fresh sandbox. Resolves when tool server is reachable. */
  acquire(options: SandboxOptions): Promise<Sandbox>;
}
