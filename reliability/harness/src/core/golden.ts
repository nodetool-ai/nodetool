/**
 * Golden-fixture assertions (§4): the `expected/outputs.json` and
 * `expected/stream.shape.json` a journey opts into via
 * `assertions.outputs` / `assertions.streamShape`.
 *
 * These are the only checks that pin down *what a run produced*. Invariants
 * describe stream shape and lifecycle; the cross-surface diff only says the
 * surfaces agree — both pass happily when every surface returns the same
 * wrong answer. A journey that declares a golden must have it compared, or
 * declaring it means nothing.
 */
import type { Journey } from "./journey.js";
import type { RunRecord } from "./record.js";
import { normalizeRunRecord, type NormalizedRunRecord } from "./normalize.js";
import { stableStringify } from "./stable-json.js";

/** One golden entry, matching `expected/stream.shape.json`'s element shape. */
interface StreamShapeEntry {
  channel: string;
  message: Record<string, unknown>;
}

export interface GoldenCheckResult {
  kind: "outputs" | "streamShape";
  /** False when the journey didn't declare it, or the run couldn't be compared. */
  checked: boolean;
  /** Why it wasn't checked. Only set when `!checked`. */
  skipReason?: string;
  /** Human-readable mismatches; empty when the golden matched. */
  failures: string[];
}

/** Max mismatching stream-shape entries reported before truncating. */
const MAX_REPORTED_ENTRIES = 10;

/**
 * A run's terminal outputs, keyed the way `expected/outputs.json` is: by an
 * Output node's public `output_name`, last value wins (a node that streams
 * several values ends on the one a client would display).
 */
export function terminalOutputsOf(record: RunRecord): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  for (const frame of record.frames) {
    if (frame.direction !== "server_to_client") continue;
    const message = frame.message as Record<string, unknown>;
    if (message["type"] !== "output_update") continue;
    const name = message["output_name"];
    if (typeof name !== "string") continue;
    outputs[name] = message["value"];
  }
  return outputs;
}

/** A run's normalized `server_to_client` stream in golden-fixture shape. */
export function streamShapeOf(
  record: RunRecord,
  normalized: NormalizedRunRecord = normalizeRunRecord(record)
): StreamShapeEntry[] {
  return normalized.frames
    .filter((frame) => frame.direction === "server_to_client")
    .map((frame) => ({ channel: frame.channel, message: frame.message }));
}

function compareOutputs(
  expected: unknown,
  record: RunRecord
): string[] {
  const actual = terminalOutputsOf(record);
  const expectedRecord = (expected ?? {}) as Record<string, unknown>;
  const failures: string[] = [];
  const keys = new Set([
    ...Object.keys(expectedRecord),
    ...Object.keys(actual)
  ]);
  for (const key of Array.from(keys).sort()) {
    const want = stableStringify(expectedRecord[key]);
    const got = stableStringify(actual[key]);
    if (want === got) continue;
    if (!(key in expectedRecord)) {
      failures.push(`unexpected output "${key}": ${got}`);
    } else if (!(key in actual)) {
      failures.push(`missing output "${key}" (expected ${want})`);
    } else {
      failures.push(`output "${key}": expected ${want}, got ${got}`);
    }
  }
  return failures;
}

function byChannel(entries: readonly StreamShapeEntry[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const serialized = stableStringify(entry.message);
    const group = groups.get(entry.channel);
    if (group) group.push(serialized);
    else groups.set(entry.channel, [serialized]);
  }
  return groups;
}

/**
 * Compared per node-channel, in channel order — the same rule the
 * cross-surface diff uses (§4: "per-node-channel, not globally"). The actor
 * model legitimately interleaves frames across nodes run to run, so a global
 * index-wise comparison would flag reorderings that are not regressions;
 * within one channel the order is the node's own and is asserted exactly.
 *
 * One limit is inherited from normalization: id placeholders are numbered by
 * order of first sight (`IdMapper`), so a run where a *different* node emits
 * first renumbers them and mismatches. The cross-surface diff has the same
 * property; journeys whose node start order isn't structurally fixed should
 * not declare `streamShape`.
 */
function compareStreamShape(
  expected: unknown,
  record: RunRecord,
  normalized: NormalizedRunRecord
): string[] {
  if (!Array.isArray(expected)) {
    return ["expected/stream.shape.json is not an array of {channel, message}"];
  }
  const golden = byChannel(expected as StreamShapeEntry[]);
  const actual = byChannel(streamShapeOf(record, normalized));
  const failures: string[] = [];

  const channels = Array.from(
    new Set([...golden.keys(), ...actual.keys()])
  ).sort();

  for (const channel of channels) {
    const want = golden.get(channel) ?? [];
    const got = actual.get(channel) ?? [];
    for (let i = 0; i < Math.max(want.length, got.length); i++) {
      if (failures.length >= MAX_REPORTED_ENTRIES) {
        failures.push("… further mismatches not reported");
        return failures;
      }
      if (want[i] === got[i]) continue;
      if (want[i] === undefined) {
        failures.push(`${channel}[${i}]: unexpected ${got[i]}`);
      } else if (got[i] === undefined) {
        failures.push(`${channel}[${i}]: missing ${want[i]}`);
      } else {
        failures.push(`${channel}[${i}]: expected ${want[i]}, got ${got[i]}`);
      }
    }
  }
  return failures;
}

/**
 * Runs the golden comparisons a journey declared against one surface's record.
 *
 * Faulted runs are skipped rather than compared: a golden describes what the
 * journey produces when nothing is broken, and every fault journey that opts
 * into outputs (`host-disk-full-write`, `python-node-workflow`) declares its
 * faults precisely because the run is *supposed* to fail under them. The skip
 * is reported, never silent.
 */
export function checkGoldens(
  journey: Journey,
  record: RunRecord,
  options: { faultsApplied?: readonly string[] } = {}
): GoldenCheckResult[] {
  const { assertions } = journey.manifest;
  const faults = options.faultsApplied ?? [];
  const results: GoldenCheckResult[] = [];

  const skipReason =
    faults.length > 0
      ? `not compared under fault(s): ${faults.join(", ")}`
      : undefined;

  // Normalize once — both goldens read from the same view.
  const normalized = assertions.streamShape ? normalizeRunRecord(record) : null;

  if (assertions.outputs) {
    results.push(
      skipReason
        ? { kind: "outputs", checked: false, skipReason, failures: [] }
        : {
            kind: "outputs",
            checked: true,
            failures: compareOutputs(journey.expected.outputs, record)
          }
    );
  }

  if (assertions.streamShape) {
    results.push(
      skipReason
        ? { kind: "streamShape", checked: false, skipReason, failures: [] }
        : {
            kind: "streamShape",
            checked: true,
            failures: compareStreamShape(
              journey.expected.streamShape,
              record,
              normalized!
            )
          }
    );
  }

  return results;
}
