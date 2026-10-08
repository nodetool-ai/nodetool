import { isRecord } from "../../../utils/typePredicates";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

export const INPUT_STATE_KEY = "__app_inputs";
export const OUTPUT_STATE_KEY = "__app_outputs";

/** Widget-local view state and invocation ownership never cross the boundary. */
export const instanceValues = (
  state: AppInstanceState
): Record<string, unknown> => ({
  ...state.variables,
  [INPUT_STATE_KEY]: Object.fromEntries(
    Object.entries(state.inputs).map(([key, slot]) => [key, slot.value])
  ),
  [OUTPUT_STATE_KEY]: Object.fromEntries(
    Object.entries(state.outputs).map(([key, slot]) => [key, slot.value])
  )
});

const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

export const restoredInstanceValues = (
  values: Record<string, unknown>
): Pick<AppInstanceState, "variables" | "inputs" | "outputs"> => {
  const {
    [INPUT_STATE_KEY]: inputs,
    [OUTPUT_STATE_KEY]: outputs,
    ...variables
  } = values;
  return {
    variables,
    inputs: Object.fromEntries(
      Object.entries(record(inputs)).map(([key, value]) => [
        key,
        { value, dirty: false, revision: 0 }
      ])
    ),
    outputs: Object.fromEntries(
      Object.entries(record(outputs)).map(([key, value]) => [
        key,
        { value, invocationId: null, status: "done", revision: 0 }
      ])
    )
  };
};

/** The server refused a save because the instance moved past its revision. */
export class AppInstanceConflictError extends Error {
  constructor(
    message = "This instance changed in another session. Reload the app before saving or running again."
  ) {
    super(message);
    this.name = "AppInstanceConflictError";
  }
}

/** The inputs and outputs maps merge one key deeper, as the server stamps them. */
const NESTED_KEYS = new Set([INPUT_STATE_KEY, OUTPUT_STATE_KEY]);

/** JSON text with sorted object keys, so equal values compare equal. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  ) ?? "undefined";

const flatValues = (values: Record<string, unknown>): Map<string, string> => {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(values)) {
    if (NESTED_KEYS.has(key) && isRecord(value)) {
      for (const [inner, item] of Object.entries(value)) {
        flat.set(`${key}/${inner}`, stableJson(item));
      }
    } else {
      flat.set(key, stableJson(value));
    }
  }
  return flat;
};

const readFlat = (
  values: Record<string, unknown>,
  key: string
): { found: boolean; value: unknown } => {
  const slash = key.indexOf("/");
  const outer = slash > 0 ? key.slice(0, slash) : key;
  if (slash > 0 && NESTED_KEYS.has(outer)) {
    const map = record(values[outer]);
    const inner = key.slice(slash + 1);
    return { found: inner in map, value: map[inner] };
  }
  return { found: key in values, value: values[key] };
};

const writeFlat = (
  values: Record<string, unknown>,
  key: string,
  entry: { found: boolean; value: unknown }
): void => {
  const slash = key.indexOf("/");
  const outer = slash > 0 ? key.slice(0, slash) : key;
  if (slash > 0 && NESTED_KEYS.has(outer)) {
    const map = { ...record(values[outer]) };
    const inner = key.slice(slash + 1);
    if (entry.found) map[inner] = entry.value;
    else delete map[inner];
    values[outer] = map;
    return;
  }
  if (entry.found) values[key] = entry.value;
  else delete values[key];
};

/**
 * Three-way merge of instance values, key by key.
 *
 * A key only one side changed takes that side. A run output both sides
 * changed takes the server's copy: the server settles run results, and the
 * client's copy is the stream it showed. A variable or input both sides
 * changed to different values is a conflict, so a stale session never
 * replaces a newer edit.
 */
export const mergeInstanceValues = (
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>
): { merged: Record<string, unknown>; conflicts: string[] } => {
  const baseFlat = flatValues(base);
  const oursFlat = flatValues(ours);
  const theirsFlat = flatValues(theirs);
  const merged: Record<string, unknown> = { ...theirs };
  const conflicts: string[] = [];
  for (const key of new Set([...oursFlat.keys(), ...baseFlat.keys()])) {
    const original = baseFlat.get(key);
    const mine = oursFlat.get(key);
    if (mine === original) continue;
    const other = theirsFlat.get(key);
    if (other === original || other === mine) {
      writeFlat(merged, key, readFlat(ours, key));
    } else if (!key.startsWith(`${OUTPUT_STATE_KEY}/`)) {
      conflicts.push(key);
    }
  }
  return { merged, conflicts };
};

/** Folds merged values into the store, touching only the keys that changed. */
export const mergedInstanceState = (
  state: AppInstanceState,
  merged: Record<string, unknown>
): Pick<AppInstanceState, "variables" | "inputs" | "outputs"> => {
  const current = flatValues(instanceValues(state));
  const next = flatValues(merged);
  const variables = { ...state.variables };
  const inputs = { ...state.inputs };
  const outputs = { ...state.outputs };
  for (const key of new Set([...current.keys(), ...next.keys()])) {
    if (current.get(key) === next.get(key)) continue;
    const { found, value } = readFlat(merged, key);
    if (key.startsWith(`${INPUT_STATE_KEY}/`)) {
      const slot = key.slice(INPUT_STATE_KEY.length + 1);
      if (found) {
        const existing = inputs[slot];
        inputs[slot] = existing
          ? { ...existing, value }
          : { value, dirty: false, revision: 0 };
      } else {
        delete inputs[slot];
      }
    } else if (key.startsWith(`${OUTPUT_STATE_KEY}/`)) {
      const slot = key.slice(OUTPUT_STATE_KEY.length + 1);
      if (found) {
        const existing = outputs[slot];
        outputs[slot] = existing
          ? { ...existing, value }
          : { value, invocationId: null, status: "done", revision: 0 };
      } else {
        delete outputs[slot];
      }
    } else if (found) {
      variables[key] = value;
    } else {
      delete variables[key];
    }
  }
  return { variables, inputs, outputs };
};

interface InstanceWriterOptions {
  /** Reads the current server state after a conflict. */
  load?: () => Promise<{ revision: number; values: Record<string, unknown> }>;
  /** Receives the merged values after a rebase, to show them. */
  onRebase?: (merged: Record<string, unknown>) => void;
}

/** Rebases at most this often per flush, so two busy writers cannot loop. */
const MAX_REBASES = 3;

/**
 * Serialize CAS writes. A conflict rebases the pending values onto the server
 * state and saves again. Only a conflict on the same key stops the queue.
 */
export class InstanceWriter {
  private revision: number;
  private saved: string;
  private pending: Record<string, unknown> | null = null;
  private saving: Promise<void> | null = null;
  private failure: Error | null = null;

  constructor(
    revision: number,
    values: Record<string, unknown>,
    private readonly save: (
      revision: number,
      values: Record<string, unknown>
    ) => Promise<number>,
    private readonly options: InstanceWriterOptions = {}
  ) {
    this.revision = revision;
    this.saved = JSON.stringify(values);
  }

  adopt(
    revision: number,
    values: Record<string, unknown>,
    current: Record<string, unknown>
  ): boolean {
    if (this.saving || this.failure || JSON.stringify(current) !== this.saved) {
      return false;
    }
    this.revision = revision;
    this.saved = JSON.stringify(values);
    this.pending = null;
    return true;
  }

  /**
   * Move onto a newer server state, keeping the local changes in `current`.
   * Returns the merged values, or null when the writer is busy or a key
   * conflicts.
   */
  rebase(
    latest: { revision: number; values: Record<string, unknown> },
    current: Record<string, unknown>,
    onRebase = this.options.onRebase
  ): Record<string, unknown> | null {
    if (this.saving || this.failure) {
      return null;
    }
    return this.applyRebase(latest, current, onRebase);
  }

  private applyRebase(
    latest: { revision: number; values: Record<string, unknown> },
    ours: Record<string, unknown>,
    onRebase: ((merged: Record<string, unknown>) => void) | undefined
  ): Record<string, unknown> | null {
    const base = JSON.parse(this.saved) as Record<string, unknown>;
    const { merged, conflicts } = mergeInstanceValues(base, ours, latest.values);
    if (conflicts.length > 0) {
      return null;
    }
    this.revision = latest.revision;
    this.saved = JSON.stringify(latest.values);
    this.pending =
      stableJson(merged) === stableJson(latest.values) ? null : merged;
    onRebase?.(merged);
    return merged;
  }

  stage(values: Record<string, unknown>): void {
    this.pending = values;
  }

  flush(): Promise<void> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.saving) {
      return this.saving;
    }
    this.saving = this.drain().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  private async drain(): Promise<void> {
    let rebases = 0;
    while (this.pending) {
      const values = this.pending;
      this.pending = null;
      const serialized = JSON.stringify(values);
      if (serialized === this.saved) {
        continue;
      }
      try {
        this.revision = await this.save(this.revision, values);
        this.saved = serialized;
      } catch (error) {
        const { load } = this.options;
        if (
          error instanceof AppInstanceConflictError &&
          load &&
          rebases < MAX_REBASES
        ) {
          rebases += 1;
          const latest = await load();
          // Edits staged during the failed save are newer than `values`.
          const ours = this.pending ?? values;
          if (this.applyRebase(latest, ours, this.options.onRebase)) {
            continue;
          }
        }
        this.failure =
          error instanceof Error ? error : new Error(String(error));
        throw this.failure;
      }
    }
  }
}
