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

/**
 * Field values treated as interchangeable "nothing here" signals (added by
 * C2): a node with zero declared `@prop` fields (the harness's own fixture
 * nodes in `drivers/fixture-nodes.ts` — no shipped node has none) serializes
 * its `properties` as `null` on the raw kernel stream but as `{}` once
 * relayed through the ws-server. Canonicalizing `null` to `{}` for these
 * keys make the two the same "no properties" value.
 */
export const NULLABLE_OBJECT_FIELDS: readonly string[] = ["properties"];

/**
 * Top-level fields the WebSocket transport stamps on a frame so a dropped
 * client can replay what it missed (`job-run-registry.ts`,
 * `chat-turn-registry.ts`). They describe the delivery, not the run, and the
 * raw kernel stream has no counterpart — dropped from the comparison view so
 * a resumable surface still diffs clean against a non-resumable one.
 */
export const TRANSPORT_ONLY_FIELDS: readonly string[] = [
  "job_seq",
  "chat_seq"
];

/**
 * Node type prefixes whose `node_update`/`generation_complete` frames are
 * dropped from comparison (added by C2). This mirrors a real, documented,
 * intentional ws-server behavior (`websocket-client-session.ts`: "Skip
 * messages for constant/input nodes — they produce trivial outputs that
 * don't need to be relayed to the frontend") that the raw kernel stream has
 * no equivalent for — the kernel emits every node's lifecycle unconditionally.
 * Normalizing both sides down to what a real frontend actually receives is
 * the honest comparison; dropping the frames here (not filtering in
 * `diff.ts`) keeps the diff itself surface-agnostic.
 */
export const TRIVIAL_NODE_TYPE_PREFIXES: readonly string[] = [
  "nodetool.constant.",
  "nodetool.input."
];

const TRIVIAL_FRAME_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "node_update",
  "generation_complete"
]);

/** True when `frame` is one `TRIVIAL_NODE_TYPE_PREFIXES` says to drop. */
function isTrivialNodeFrame(message: Record<string, unknown>): boolean {
  if (!TRIVIAL_FRAME_MESSAGE_TYPES.has(String(message["type"]))) return false;
  const nodeType = message["node_type"];
  return (
    typeof nodeType === "string" &&
    TRIVIAL_NODE_TYPE_PREFIXES.some((prefix) => nodeType.startsWith(prefix))
  );
}

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
  if (key && NULLABLE_OBJECT_FIELDS.includes(key) && value === null) {
    return {};
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

/**
 * `job_update`'s optional `result` field (added by C2): the ws-server relay
 * appends an "authoritative terminal snapshot" `job_update` carrying the
 * full `result.outputs` whenever the relayed kernel terminal frame lacked
 * one (`websocket-client-session.ts`'s `terminalWithResultSeen` check) — the
 * kernel's own `job_update` emissions (`runner.ts`) never set `result` at
 * all. Dropped only on `job_update` (not `node_update`, whose own `result`
 * is real per-node data the outputs assertion depends on).
 */
function stripJobUpdateResult(message: Record<string, unknown>): Record<string, unknown> {
  if (message["type"] !== "job_update" || !("result" in message)) return message;
  const rest = { ...message };
  delete rest["result"];
  return rest;
}

/** Normalizes one message (a frame's payload) in place-equivalent (returns a new object). */
export function normalizeMessage(
  message: Record<string, unknown>,
  mapper: IdMapper
): Record<string, unknown> {
  const payload = { ...stripJobUpdateResult(message) };
  for (const field of TRANSPORT_ONLY_FIELDS) delete payload[field];
  return normalizeValue(payload, null, mapper) as Record<string, unknown>;
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
  const frames: NormalizedRunFrame[] = record.frames
    // Frames a driver tagged as its surface's own documented redundancy
    // (`RunFrame.redundant`) have no counterpart on the kernel's raw stream,
    // so they are dropped here — in the comparison view only. The record
    // itself keeps them, and the invariants read the record.
    .filter((frame) => frame.redundant === undefined)
    .filter((frame) => !isTrivialNodeFrame(frame.message as Record<string, unknown>))
    .map((frame) => ({
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
