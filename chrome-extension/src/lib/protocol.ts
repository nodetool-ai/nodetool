/**
 * Wire-protocol types for the `/ws/extension` side channel.
 *
 * This is the extension-side mirror copy. The CANONICAL source of these type
 * definitions lives at
 * `packages/automation-nodes/src/lib/extension-protocol.ts`. The extension is a
 * separate greenfield build that cannot import from `packages/`, so the
 * definitions are duplicated here and must stay byte-identical to the canonical
 * copy; only this header comment differs.
 *
 * Frames are JSON text on `/ws/extension` (the main `/ws` stays MsgPack).
 * Every frame is discriminated by `kind`.
 *
 * Direction legend:
 *   host→ext : nodetool server / action loop -> Chrome extension
 *   ext→host : Chrome extension -> nodetool server / action loop
 */

/** A CDP command invocation. host→ext. */
export interface CdpCommandFrame {
  kind: "cdp";
  /** Monotonic request id, unique per host connection. */
  id: number;
  /** Fully-qualified CDP method, e.g. `"Page.navigate"`. */
  method: string;
  /** CDP command parameters. */
  params?: Record<string, unknown>;
  /** Optional CDP session id (flat-session multi-target). */
  sessionId?: string;
}

/** Result (or error) for a previously sent {@link CdpCommandFrame}. ext→host. */
export interface CdpResultFrame {
  kind: "cdp_result";
  /** Echoes the {@link CdpCommandFrame.id} this responds to. */
  id: number;
  /** CDP command result. Present when the command succeeded. */
  result?: Record<string, unknown>;
  /**
   * Present when the command failed. Surfaced host-side as
   * `throw new Error(error.message)` to match `chrome-remote-interface`.
   */
  error?: { message: string };
}

/** A forwarded CDP event from the attached tab. ext→host. */
export interface CdpEventFrame {
  kind: "cdp_event";
  /** Fully-qualified CDP event name, e.g. `"Page.loadEventFired"`. */
  method: string;
  /** CDP event payload. */
  params?: Record<string, unknown>;
  /** Optional CDP session id the event originated from. */
  sessionId?: string;
}

/** Request the extension to attach the debugger to the active tab. host→ext. */
export interface AttachFrame {
  kind: "attach";
  /** Logical session key the host uses to route frames. */
  sessionId?: string;
}

/** Acknowledges a successful {@link AttachFrame}. ext→host. */
export interface AttachedFrame {
  kind: "attached";
  /** The Chrome tab id the debugger attached to. */
  tabId: number;
  /** Logical session key, echoing {@link AttachFrame.sessionId}. */
  sessionId?: string;
}

/** Request the extension to detach the debugger. host→ext or ext→host. */
export interface DetachFrame {
  kind: "detach";
  /** Logical session key. */
  sessionId?: string;
  /** Optional human-readable reason (e.g. user closed the tab). */
  reason?: string;
}

/** Heartbeat. host→ext. */
export interface PingFrame {
  kind: "ping";
  /** Monotonic ping sequence, echoed back in {@link PongFrame}. */
  ts: number;
}

/** Heartbeat reply. ext→host. */
export interface PongFrame {
  kind: "pong";
  /** Echoes {@link PingFrame.ts}. */
  ts: number;
}

/**
 * Fatal channel error. ext→host. The host rejects all pending commands and
 * surfaces a restart-needed error; this is not used for per-command failures
 * (those ride {@link CdpResultFrame.error}).
 */
export interface ErrorFrame {
  kind: "error";
  /** Human-readable description of the fatal condition. */
  message: string;
}

/**
 * A chunk of asset bytes streamed from host to extension (e.g. for
 * `upload_asset`'s DataTransfer fallback). host→ext.
 */
export interface AssetChunkFrame {
  kind: "asset_chunk";
  /** Transfer id grouping the chunks of a single asset. */
  transferId: string;
  /** Zero-based chunk index. */
  seq: number;
  /** Base64-encoded chunk payload. */
  data: string;
  /** MIME type of the asset; sent on every chunk for convenience. */
  mime?: string;
  /** Suggested file name for the materialized `File`. */
  fileName?: string;
  /** True on the final chunk. */
  last: boolean;
}

/**
 * A chunk of captured media bytes streamed from extension to host (the
 * `chrome.downloads` capture fallback). ext→host.
 */
export interface MediaChunkFrame {
  kind: "media_chunk";
  /** Transfer id grouping the chunks of a single capture. */
  transferId: string;
  /** Zero-based chunk index. */
  seq: number;
  /** Base64-encoded chunk payload. */
  data: string;
}

/** Terminates a {@link MediaChunkFrame} stream. ext→host. */
export interface MediaEndFrame {
  kind: "media_end";
  /** Transfer id this terminates. */
  transferId: string;
  /** Total byte count across all chunks (for integrity checks). */
  totalBytes: number;
  /** MIME type of the captured media, if known. */
  mime?: string;
  /** Source file name from `chrome.downloads`, if known. */
  fileName?: string;
  /** Present when the capture failed. */
  error?: { message: string };
}

/** Any frame sent host→ext. */
export type ExtensionHostToExtFrame =
  | CdpCommandFrame
  | AttachFrame
  | DetachFrame
  | PingFrame
  | AssetChunkFrame;

/** Any frame sent ext→host. */
export type ExtensionExtToHostFrame =
  | CdpResultFrame
  | CdpEventFrame
  | AttachedFrame
  | DetachFrame
  | PongFrame
  | ErrorFrame
  | MediaChunkFrame
  | MediaEndFrame;

/** The full discriminated union of all `/ws/extension` frames. */
export type ExtensionFrame = ExtensionHostToExtFrame | ExtensionExtToHostFrame;

/** Narrow an {@link ExtensionFrame} to a {@link CdpResultFrame}. */
export function isCdpResultFrame(frame: ExtensionFrame): frame is CdpResultFrame {
  return frame.kind === "cdp_result";
}

/** Narrow an {@link ExtensionFrame} to a {@link CdpEventFrame}. */
export function isCdpEventFrame(frame: ExtensionFrame): frame is CdpEventFrame {
  return frame.kind === "cdp_event";
}

/**
 * Best-effort runtime parse of an inbound JSON text frame. Returns the typed
 * frame when it has a string `kind`, otherwise `null`. Does not validate the
 * full shape of each variant — callers narrow with the discriminant.
 */
export function parseExtensionFrame(raw: string): ExtensionFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  ) {
    return value as ExtensionFrame;
  }
  return null;
}
