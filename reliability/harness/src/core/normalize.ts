/**
 * Stream normalization (§4, §12): strips/canonicalizes timestamps, remaps
 * ids (job/node/edge/asset ids) to stable placeholders, and canonicalizes
 * durations and asset URLs, so two runs of the same journey on different
 * surfaces — with different job ids, different wall-clock timing, different
 * asset storage paths — normalize to the same shape and diff clean.
 *
 * Declarative: the field lists below are the whole policy. A driver that
 * needs an extra field normalized adds it here, once, for every consumer
 * (diff, invariants, `nodetool reliability`).
 */
import type { RunFrame, RunRecord } from "./record.js";

/** Field names (anywhere in a message, at any depth) treated as ids that get
 * remapped to a stable `<class:N>` placeholder, keyed by their remap class. */
export const ID_FIELD_CLASSES: Readonly<Record<string, string>> = {
  job_id: "job",
  workflow_id: "workflow",
  node_id: "node",
  edge_id: "edge",
  provider_request_id: "provider-request"
};

/** Field names replaced wholesale with `<ts>` — the value never matters, only presence. */
export const TIMESTAMP_FIELDS: readonly string[] = [
  "timestamp",
  "ts",
  "created_at",
  "generatedAt"
];

/** Field names replaced wholesale with `<duration>`. */
export const DURATION_FIELDS: readonly string[] = [
  "duration",
  "durationMs",
  "duration_ms"
];

/** Asset references: `asset://…`, an `/assets/…` URL, or an inline data URI. */
const ASSET_URL_PATTERN =
  /^(asset:\/\/|https?:\/\/[^\s]+\/assets\/|data:[^;]+;base64,)/;

/**
 * Assigns each distinct original id value a stable, order-of-first-sight
 * placeholder within one normalization pass. Two records normalized
 * independently line up as long as ids first appear in the same relative
 * order — which is exactly the "same journey, different surface" case this
 * exists for.
 */
export class IdMapper {
  private readonly maps = new Map<string, Map<string, string>>();

  placeholderFor(cls: string, value: string): string {
    let map = this.maps.get(cls);
    if (!map) {
      map = new Map();
      this.maps.set(cls, map);
    }
    let placeholder = map.get(value);
    if (!placeholder) {
      placeholder = `<${cls}:${map.size}>`;
      map.set(value, placeholder);
    }
    return placeholder;
  }
}

function normalizeValue(value: unknown, key: string | null, mapper: IdMapper): unknown {
  if (key && key in ID_FIELD_CLASSES && typeof value === "string") {
    return mapper.placeholderFor(ID_FIELD_CLASSES[key], value);
  }
  if (key && TIMESTAMP_FIELDS.includes(key)) {
    return value == null ? value : "<ts>";
  }
  if (key && DURATION_FIELDS.includes(key)) {
    return value == null ? value : "<duration>";
  }
  if (typeof value === "string" && ASSET_URL_PATTERN.test(value)) {
    return "<asset>";
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, null, mapper));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeValue(v, k, mapper);
    }
    return out;
  }
  return value;
}

/** Normalizes one message (a frame's payload) in place-equivalent (returns a new object). */
export function normalizeMessage(
  message: Record<string, unknown>,
  mapper: IdMapper
): Record<string, unknown> {
  return normalizeValue(message, null, mapper) as Record<string, unknown>;
}

export interface NormalizedRunFrame {
  seq: number;
  channel: string;
  direction: RunFrame["direction"];
  surface: string;
  message: Record<string, unknown>;
}

export interface NormalizedRunRecord {
  journeyId?: string;
  surface: string;
  status: string;
  error: string | null;
  jobId: string | null;
  workflowId: string | null;
  frames: NormalizedRunFrame[];
}

/**
 * Normalizes a whole `RunRecord`: every frame's message, plus the record's
 * own `jobId`/`workflowId` (through the same mapper, so they match the
 * placeholders used inside the frames). `startedAt`/`finishedAt`/`durationMs`
 * are dropped — wall-clock fields carry no comparison value once
 * normalized, per §4.
 */
export function normalizeRunRecord(
  record: RunRecord,
  mapper: IdMapper = new IdMapper()
): NormalizedRunRecord {
  const frames: NormalizedRunFrame[] = record.frames.map((frame) => ({
    seq: frame.seq,
    channel: frame.channel,
    direction: frame.direction,
    surface: frame.surface,
    message: normalizeMessage(frame.message as Record<string, unknown>, mapper)
  }));

  return {
    journeyId: record.journeyId,
    surface: record.surface,
    status: record.status,
    error: record.error,
    jobId:
      record.jobId !== null
        ? mapper.placeholderFor(ID_FIELD_CLASSES.job_id, record.jobId)
        : null,
    workflowId:
      record.workflowId !== null
        ? mapper.placeholderFor(ID_FIELD_CLASSES.workflow_id, record.workflowId)
        : null,
    frames
  };
}
