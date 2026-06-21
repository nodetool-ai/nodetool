/**
 * Demo "cast" format — the stored, replayable product-demo recording.
 *
 * A cast is a self-contained, backend-free capture of one workflow run:
 *   - the workflow graph (with the real editor positions),
 *   - a snapshot of the node metadata for every node type it uses,
 *   - a time-stamped timeline of the exact protocol messages the backend
 *     streamed during the run (job/node/progress/output/chunk/...),
 *   - a manifest of every generated asset the run referenced, pinned to local
 *     files so replay never re-generates (no credits burned).
 *
 * Casts are plain JSON: diffable, version-controllable, and editable after the
 * fact (retime, trim, swap assets). The demo player (web/src/demo/DemoPlayer)
 * replays a cast deterministically as a pure function of elapsed time, so a
 * frame-based renderer (Remotion) can scrub it.
 */
import type {
  NodeMetadata,
  Workflow,
} from "../stores/ApiTypes";

/** Schema version. Bump on breaking changes to the cast shape. */
export const CAST_VERSION = 1 as const;

/**
 * URI scheme that stands in for a pinned asset inside a cast. The player
 * rewrites `cast-asset://<key>` to a host URL at load time (Vite public dir,
 * Remotion staticFile, …), so the recorded messages carry no host-specific
 * URLs. See `assetSubstitution.ts`.
 */
export const CAST_ASSET_SCHEME = "cast-asset://";

/** One pinned, pre-generated asset referenced by the run. */
export interface CastAsset {
  /** Stable key used in `cast-asset://<key>` references inside the timeline. */
  key: string;
  /** File name within the cast's asset directory (e.g. `node-3-image.png`). */
  file: string;
  /** MIME type, used to set the right `Blob`/`<img>`/`<video>` handling. */
  contentType: string;
  /** Where the asset was downloaded from at record time (provenance only). */
  originalUri?: string;
  /** Byte length of the pinned file, if known. */
  bytes?: number;
}

/** A single protocol message stamped with its offset from the cast start. */
export interface CastEvent {
  /** Milliseconds from the start of the timeline (`events[0].t === 0`). */
  t: number;
  /**
   * A backend protocol message (`job_update`, `node_update`, `node_progress`,
   * `output_update`, `chunk`, `generation_complete`, `edge_update`, …). Kept
   * loose here; the engine casts to the reducer's `MsgpackData` union at apply
   * time. Asset URIs inside have been rewritten to `cast-asset://<key>`.
   */
  message: { type: string; [key: string]: unknown };
}

/** A fixed camera pose for the canvas. When absent, the player fits the graph. */
export interface CastViewport {
  x: number;
  y: number;
  zoom: number;
}

/** A complete, replayable product-demo recording. */
export interface DemoCast {
  version: typeof CAST_VERSION;
  /** Unique id for the cast (also names its asset directory). */
  id: string;
  /** Human title shown in the demo gallery. */
  name: string;
  description?: string;
  /** ISO timestamp the cast was recorded. */
  createdAt: string;
  /** Total timeline length in ms (>= last event `t`, plus any tail hold). */
  durationMs: number;
  /** Suggested frame rate for rendering this cast. Defaults to 30. */
  fps?: number;
  /** The workflow graph + attributes, with the real saved node positions. */
  workflow: Workflow;
  /** Node metadata for every node type used by the graph (exact, not inferred). */
  metadata: Record<string, NodeMetadata>;
  /** Timeline of protocol messages, sorted ascending by `t`. */
  events: CastEvent[];
  /** Pinned assets the timeline references via `cast-asset://<key>`. */
  assets: CastAsset[];
  /** Optional fixed camera; when omitted the player fits the graph to view. */
  viewport?: CastViewport;
}

/** Narrow runtime guard — enough to fail fast on a malformed cast file. */
export function isDemoCast(value: unknown): value is DemoCast {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === CAST_VERSION &&
    typeof c.id === "string" &&
    typeof c.workflow === "object" &&
    c.workflow !== null &&
    Array.isArray(c.events) &&
    Array.isArray(c.assets) &&
    typeof c.metadata === "object" &&
    c.metadata !== null
  );
}
