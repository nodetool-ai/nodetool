import { z } from "zod";
import { anyGameDocument, gameAuthoring, gameAuthoringOverride, type AnyGameDocument, type GameAuthoringOverride, type GameAuthoringTarget } from "@nodetool-ai/protocol";
import { trackGameAuthoringEdits } from "./authoring-reconcile.js";

const target = { scene_id: z.string().min(1), entity_id: z.string().min(1) };
const index = z.number().int().min(0).max(50_000).optional();
export const overrideMembershipOp = z.strictObject({ op: z.literal("set_override_membership"), ...target,
  path: gameAuthoringOverride.shape.path, override: gameAuthoringOverride.pick({ value: true, remove: true }).nullable(), index });
export const authoringMembershipOp = z.strictObject({ op: z.literal("set_authoring_membership"), ...target,
  membership: z.enum(["suppression", "detachment"]), present: z.boolean(),
  positions: z.array(z.number().int().min(0).max(49_999)).min(1).max(50_000)
    .refine((positions) => positions.every((position, index) => index === 0 || position > positions[index - 1]),
      "Ownership positions must be strictly increasing").optional() });
type OwnershipOp = z.infer<typeof overrideMembershipOp> | z.infer<typeof authoringMembershipOp>;
type Membership = "overrides" | "suppressions" | "detached";
export interface GameOwnershipDeltaState {
  readonly overrides: Map<string, GameAuthoringOverride | null>;
  readonly suppressions: Map<string, { readonly target: GameAuthoringTarget; readonly count: number }>;
  readonly detached: Map<string, { readonly target: GameAuthoringTarget; readonly count: number }>;
  readonly opIndexes: Map<string, number>;
  readonly reject: (opIndex: number, path: (string | number)[], message: string) => never;
  lastOpIndex: number;
}
export function createGameOwnershipDeltaState(reject: GameOwnershipDeltaState["reject"]): GameOwnershipDeltaState {
  return { overrides: new Map(), suppressions: new Map(), detached: new Map(), opIndexes: new Map(), reject, lastOpIndex: 0 };
}
function keyOf(entry: GameAuthoringTarget | GameAuthoringOverride): string {
  return JSON.stringify("path" in entry ? [entry.sceneId, entry.entityId, entry.path] : [entry.sceneId, entry.entityId]);
}
function setMembership<Entry extends GameAuthoringTarget>(entries: Entry[], entry: Entry, present: boolean, index: number | undefined,
  reject: (message: string) => never): void {
  const key = keyOf(entry);
  const previous = entries.findIndex((candidate) => keyOf(candidate) === key);
  if (entries.filter((candidate) => keyOf(candidate) === key).length > 1) {
    reject("Ownership delta requires an unambiguous target key");
  }
  if (!present && index !== undefined) { reject("Removed ownership cannot specify an insertion index"); }
  const remainingLength = entries.length - Number(previous >= 0);
  const at = index ?? (previous >= 0 ? previous : remainingLength);
  if (present && (at > remainingLength || remainingLength >= 50_000)) { reject("Ownership insertion index is out of range"); }
  if (previous >= 0) { entries.splice(previous, 1); }
  if (present) { entries.splice(at, 0, entry); }
}
function setFlagMembership(entries: GameAuthoringTarget[], target: GameAuthoringTarget, present: boolean,
  positions: readonly number[] | undefined, reject: (message: string) => never): GameAuthoringTarget[] {
  const key = keyOf(target);
  const previous: number[] = [];
  const remaining: GameAuthoringTarget[] = [];
  for (const [index, entry] of entries.entries()) {
    if (keyOf(entry) === key) { previous.push(index); } else { remaining.push(entry); }
  }
  if (!present) {
    if (positions !== undefined) { reject("Removed ownership cannot specify occurrence positions"); }
    return remaining;
  }
  const selected = positions ?? (previous.length ? previous : [remaining.length]);
  const length = remaining.length + selected.length;
  if (length > 50_000 || selected[selected.length - 1] >= length) {
    reject("Ownership occurrence position is out of range");
  }
  const result: GameAuthoringTarget[] = [];
  let occurrence = 0;
  let retained = 0;
  for (let index = 0; index < length; index++) {
    if (selected[occurrence] === index) { result.push({ ...target }); occurrence++; }
    else { result.push(remaining[retained++]); }
  }
  return result;
}
export function applyGameOwnershipOperation(document: AnyGameDocument, op: OwnershipOp, state: GameOwnershipDeltaState, opIndex: number): void {
  const authoring = document.authoring;
  if (!authoring) { state.reject(opIndex, ["authoring"], "Game has no retained authoring"); }
  const target = { sceneId: op.scene_id, entityId: op.entity_id };
  if (op.op === "set_override_membership") {
    const entry: GameAuthoringOverride = { ...target, path: op.path, value: op.override?.value ?? null };
    if (op.override?.remove !== undefined) { entry.remove = op.override.remove; }
    setMembership(authoring.overrides, entry, op.override !== null, op.index,
      (message) => state.reject(opIndex, ["authoring", "overrides"], message));
    state.overrides.set(keyOf(entry), op.override === null ? null : entry);
    state.opIndexes.set(`overrides:${keyOf(entry)}`, opIndex);
  } else {
    const membership = op.membership === "suppression" ? "suppressions" : "detached";
    authoring[membership] = setFlagMembership(authoring[membership], target, op.present, op.positions,
      (message) => state.reject(opIndex, ["authoring", membership], message));
    const count = op.present ? authoring[membership].filter((entry) => keyOf(entry) === keyOf(target)).length : 0;
    state[membership].set(keyOf(target), { target, count });
    state.opIndexes.set(`${membership}:${keyOf(target)}`, opIndex);
  }
  state.lastOpIndex = opIndex;
}

/** Check requested ownership after field reconciliation, then preserve the composed insertion order. */
export function reconcileGameOwnershipDeltas(before: AnyGameDocument, draft: AnyGameDocument, state: GameOwnershipDeltaState): AnyGameDocument {
  if (!state.overrides.size && !state.suppressions.size && !state.detached.size) { return trackGameAuthoringEdits(before, draft); }
  const metadata = gameAuthoring.safeParse(draft.authoring);
  if (!metadata.success) { state.reject(state.lastOpIndex, ["authoring"], metadata.error.issues[0].message); }
  let tracked: AnyGameDocument;
  try {
    tracked = trackGameAuthoringEdits(before, draft);
  } catch (error) {
    if (error instanceof z.ZodError) { state.reject(state.lastOpIndex, ["authoring"], error.issues[0].message); }
    throw error;
  }
  if (!draft.authoring || !tracked.authoring) { state.reject(state.lastOpIndex, ["authoring"], "Game has no retained authoring"); }
  for (const membership of ["overrides", "suppressions", "detached"] satisfies Membership[]) {
    const composedCounts = new Map<string, number>();
    for (const entry of draft.authoring[membership]) {
      const key = keyOf(entry);
      composedCounts.set(key, (composedCounts.get(key) ?? 0) + 1);
    }
    const actual = new Map<string, { entries: (GameAuthoringTarget | GameAuthoringOverride)[]; cursor: number }>();
    for (const entry of tracked.authoring[membership]) {
      const key = keyOf(entry);
      const bucket = actual.get(key) ?? { entries: [], cursor: 0 };
      bucket.entries.push(entry);
      actual.set(key, bucket);
    }
    for (const [key, requested] of state[membership]) {
      const entries = actual.get(key)?.entries ?? [];
      const agrees = membership === "overrides"
        ? requested === null ? entries.length === 0 : entries.length === 1 && JSON.stringify(requested) === JSON.stringify(entries[0])
        : requested !== null && "count" in requested && (composedCounts.get(key) ?? 0) === requested.count
          && (requested.count === 0 ? entries.length === 0 : entries.length > 0);
      if (!agrees) {
        state.reject(state.opIndexes.get(`${membership}:${key}`) ?? state.lastOpIndex,
          ["authoring", membership], "Requested ownership disagrees with reconciled game fields");
      }
    }
    const ordered = draft.authoring[membership].flatMap((entry) => {
      const bucket = actual.get(keyOf(entry));
      const next = bucket?.entries[bucket.cursor];
      if (!bucket) { return []; }
      if (membership !== "overrides") { bucket.cursor++; return [entry]; }
      if (!next) { return []; }
      bucket.cursor++;
      return [next];
    });
    for (const bucket of actual.values()) { ordered.push(...bucket.entries.slice(bucket.cursor)); }
    Object.assign(tracked.authoring, { [membership]: ordered });
  }
  const parsed = anyGameDocument.safeParse(tracked);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    state.reject(state.lastOpIndex, ["authoring"], issue.message);
  }
  return parsed.data;
}
