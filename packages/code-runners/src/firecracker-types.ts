/**
 * firecracker-types.ts
 *
 * Shared types for Firecracker microVM-based code runners.
 * Covers VM configuration, runner options, pool configuration,
 * and the JSON-line protocol used between host and guest agent over vsock.
 */

import type { Slot } from "./stream-runner-base.js";

// ---------------------------------------------------------------------------
// VM configuration
// ---------------------------------------------------------------------------

/** Network interface configuration for a Firecracker VM. */
export interface FirecrackerNetworkConfig {
  /** Host TAP device name (e.g., "tap0"). Must exist before VM boot. */
  hostDevName: string;
  /** Guest MAC address. When omitted the guest uses its default. */
  guestMac?: string;
}

/** Full configuration for a single Firecracker microVM. */
export interface FirecrackerVMConfig {
  /** Path to an uncompressed Linux kernel image (vmlinux). */
  kernelImagePath: string;
  /** Path to the ext4 root filesystem image. */
  rootfsPath: string;
  /** Number of virtual CPUs. Default: 1. */
  vcpuCount?: number;
  /** Memory size in MiB. Default: 128. */
  memSizeMib?: number;
  /** Kernel boot arguments. A sensible default is provided when omitted. */
  bootArgs?: string;
  /** Whether the rootfs is mounted read-only. Default: false. */
  rootfsReadOnly?: boolean;
  /** Network interface configuration. Null means no networking. */
  networkInterface?: FirecrackerNetworkConfig | null;
}

// ---------------------------------------------------------------------------
// Runner options
// ---------------------------------------------------------------------------

/** Options for {@link FirecrackerRunner}. */
export interface FirecrackerRunnerOptions {
  /** Path to an uncompressed Linux kernel image (vmlinux). */
  kernelImagePath: string;
  /**
   * Map of rootfs image paths keyed by language name.
   * Each rootfs must contain the language runtime and the guest agent.
   * Keys: "python", "javascript", "bash", "ruby", "lua", etc.
   */
  rootfsImages: Record<string, string>;
  /** Fallback rootfs used when the requested language has no entry. */
  defaultRootfs?: string;
  /** Path to the `firecracker` binary. Default: "firecracker". */
  firecrackerBin?: string;
  /** vCPUs per VM. Default: 1. */
  vcpuCount?: number;
  /** Memory per VM in MiB. Default: 128. */
  memSizeMib?: number;
  /** Code execution timeout in seconds. Default: 10. */
  timeoutSeconds?: number;
  /** Vsock port the guest agent listens on. Default: 1024. */
  guestAgentPort?: number;
  /** Kernel boot arguments override. */
  bootArgs?: string;
  /** Network configuration per VM. Default: null (isolated). */
  networkInterface?: FirecrackerNetworkConfig | null;
}

/** Extra options passed to {@link FirecrackerRunner.stream}. */
export interface FirecrackerStreamOptions {
  /** Override language for this execution (default inferred from runner). */
  language?: string;
  /** Working directory context (unused in VM mode, reserved for future). */
  workspaceDir?: string;
}

// ---------------------------------------------------------------------------
// Pool options
// ---------------------------------------------------------------------------

/** Options for {@link FirecrackerPool}. */
export interface FirecrackerPoolConfig {
  /** VM configuration template. */
  vmConfig: FirecrackerVMConfig;
  /** Path to the `firecracker` binary. Default: "firecracker". */
  firecrackerBin?: string;
  /** Number of VMs to keep pre-booted. Default: 2. */
  poolSize?: number;
  /** Hard cap on total VMs (pool + in-use). Default: 10. */
  maxVms?: number;
}

// ---------------------------------------------------------------------------
// Guest agent protocol (JSON lines over vsock)
// ---------------------------------------------------------------------------

/**
 * Request sent from the host to the guest agent.
 *
 * The host writes exactly one JSON line (terminated by `\n`) after the
 * vsock handshake completes.
 */
export interface GuestExecRequest {
  action: "exec";
  /** Language runtime to invoke (e.g., "python", "javascript", "bash"). */
  language: string;
  /** Source code to execute. */
  code: string;
  /** Environment variables / locals to inject. */
  env: Record<string, unknown>;
  /** Execution timeout in seconds. */
  timeout: number;
}

/** Stdout or stderr chunk from the guest agent. */
export interface GuestOutputMessage {
  type: "stdout" | "stderr";
  /** Raw text data (may contain newlines). */
  data: string;
}

/** Execution completion message from the guest agent. */
export interface GuestExitMessage {
  type: "exit";
  /** Process exit code. 0 = success. */
  code: number;
}

/** Union of all messages the guest agent may send. */
export type GuestMessage = GuestOutputMessage | GuestExitMessage;

// Re-export Slot for convenience
export type { Slot };
