import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";

type OwnershipOp = Extract<AnyGameDocumentOp, { op: "set_override_membership" | "set_authoring_membership" }>;
type Target = { sceneId: string; entityId: string };
function targetKey(target: Target): string { return JSON.stringify([target.sceneId, target.entityId]); }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function movedKeys(from: readonly string[], to: readonly string[], excluded: ReadonlySet<string>): Set<string> {
  const positions = new Map<string, number[]>();
  to.forEach((key, index) => {
    if (excluded.has(key)) { return; }
    const existing = positions.get(key);
    if (existing) { existing.push(index); } else { positions.set(key, [index]); }
  });
  const occurrences = new Map<string, number>();
  const sequence: { key: string; position: number }[] = [];
  for (const key of from) {
    const desired = positions.get(key);
    if (!desired) { continue; }
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    sequence.push({ key, position: desired[occurrence] });
  }
  const tails: number[] = [], tailEntries: number[] = [];
  const previous = new Int32Array(sequence.length).fill(-1);
  sequence.forEach((entry, index) => {
    let low = 0, high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tails[middle] < entry.position) { low = middle + 1; } else { high = middle; }
    }
    if (low > 0) { previous[index] = tailEntries[low - 1]; }
    tails[low] = entry.position;
    tailEntries[low] = index;
  });
  const retained = new Set<number>();
  for (let index = tailEntries.at(-1) ?? -1; index >= 0; index = previous[index]) { retained.add(index); }
  return new Set(sequence.filter((_, index) => !retained.has(index)).map((entry) => entry.key));
}

function prefixRanks(length: number): { add: (position: number) => void; rank: (position: number) => number } {
  const ranks = new Int32Array(length + 1);
  return {
    add: (position) => {
      for (let index = position + 1; index < ranks.length; index += index & -index) { ranks[index]++; }
    },
    rank: (position) => {
      let result = 0;
      for (let index = position + 1; index > 0; index -= index & -index) { result += ranks[index]; }
      return result - 1;
    }
  };
}

function flagDeltas(from: readonly Target[], to: readonly Target[], applied: readonly Target[],
  membership: "suppression" | "detachment"): OwnershipOp[] {
  function positions(entries: readonly Target[]): Map<string, number[]> {
    const result = new Map<string, number[]>();
    entries.forEach((entry, index) => {
      const key = targetKey(entry);
      const group = result.get(key);
      if (group) { group.push(index); } else { result.set(key, [index]); }
    });
    return result;
  }
  const before = positions(from), after = positions(to), working = positions(applied);
  const changed = new Set([...before.keys(), ...working.keys(), ...after.keys()].filter((key) =>
    (before.get(key)?.length ?? 0) !== (after.get(key)?.length ?? 0)
      || (working.get(key)?.length ?? 0) !== (after.get(key)?.length ?? 0)));
  const desiredKeys = to.map(targetKey);
  for (const key of movedKeys(from.map(targetKey), desiredKeys, changed)) { changed.add(key); }
  for (const key of movedKeys(applied.map(targetKey), desiredKeys, changed)) { changed.add(key); }
  if (changed.size === 0) { return []; }
  const targets = new Map([...from, ...applied, ...to].map((entry) => [targetKey(entry), entry]));
  const ops: OwnershipOp[] = [];
  for (const key of changed) {
    const target = targets.get(key);
    if (!target) { throw new Error("Missing ownership target"); }
    ops.push({ op: "set_authoring_membership", scene_id: target.sceneId, entity_id: target.entityId,
      membership, present: false });
  }
  // Prefix ranks keep insertion positions relative to the keys already present.
  const { add, rank } = prefixRanks(to.length);
  to.forEach((entry, index) => { if (!changed.has(targetKey(entry))) { add(index); } });
  for (const [key, indexes] of after) {
    if (!changed.has(key)) { continue; }
    indexes.forEach(add);
    const target = targets.get(key);
    if (!target) { throw new Error("Missing ownership target"); }
    ops.push({ op: "set_authoring_membership", scene_id: target.sceneId, entity_id: target.entityId,
      membership, present: true, positions: indexes.map(rank) });
  }
  return ops;
}

export function sameGameAuthoringDefinitions(from: AnyGameDocument, to: AnyGameDocument): boolean {
  const source = from.authoring, desired = to.authoring;
  if (!source || !desired) { return source === desired; }
  return same({ version: source.version, program: source.program, baseline: source.baseline,
    parameters: source.parameters, prefabs: source.prefabs, instances: source.instances },
  { version: desired.version, program: desired.program, baseline: desired.baseline,
    parameters: desired.parameters, prefabs: desired.prefabs, instances: desired.instances });
}

/** Capture changed ownership explicitly so separately authored edits remain valid as one wire batch. */
export function diffGameOwnership(from: AnyGameDocument, to: AnyGameDocument, applied = from): OwnershipOp[] {
  const source = from.authoring, desired = to.authoring, current = applied.authoring;
  if (!source && !desired && !current) { return []; }
  if (!source || !desired || !current || !sameGameAuthoringDefinitions(from, to) || !sameGameAuthoringDefinitions(applied, to)) {
    throw new Error("Ownership operations cannot replace retained construction definitions");
  }
  const key = (entry: typeof source.overrides[number]): string => JSON.stringify([entry.sceneId, entry.entityId, entry.path]);
  const before = new Map(source.overrides.map((entry, index) => [key(entry), { entry, index }]));
  const working = new Map(current.overrides.map((entry, index) => [key(entry), { entry, index }]));
  const after = new Map(desired.overrides.map((entry, index) => [key(entry), { entry, index }]));
  const affected = new Set([...before.keys(), ...working.keys(), ...after.keys()].filter((id) =>
    !same(before.get(id)?.entry, after.get(id)?.entry) || !same(working.get(id)?.entry, after.get(id)?.entry)));
  const desiredKeys = desired.overrides.map(key);
  for (const id of movedKeys(source.overrides.map(key), desiredKeys, affected)) { affected.add(id); }
  for (const id of movedKeys(current.overrides.map(key), desiredKeys, affected)) { affected.add(id); }
  const stableOverrideOrder = same(source.overrides.map(key), desiredKeys) && same(current.overrides.map(key), desiredKeys);
  const ops: OwnershipOp[] = [];
  for (const id of affected) {
    if (stableOverrideOrder) { continue; }
    const entry = working.get(id)?.entry ?? before.get(id)?.entry;
    if (!entry) { continue; }
    ops.push({ op: "set_override_membership", scene_id: entry.sceneId, entity_id: entry.entityId,
      path: entry.path, override: null });
  }
  const { add, rank } = prefixRanks(desired.overrides.length);
  desiredKeys.forEach((id, index) => { if (!affected.has(id)) { add(index); } });
  for (const [id, { entry, index }] of after) {
    if (!affected.has(id)) { continue; }
    const override: { value: typeof entry.value; remove?: boolean } = { value: entry.value };
    if (entry.remove !== undefined) { override.remove = entry.remove; }
    if (stableOverrideOrder) {
      ops.push({ op: "set_override_membership", scene_id: entry.sceneId, entity_id: entry.entityId,
        path: entry.path, override });
    } else {
      add(index);
      ops.push({ op: "set_override_membership", scene_id: entry.sceneId, entity_id: entry.entityId,
        path: entry.path, override, index: rank(index) });
    }
  }
  ops.push(...flagDeltas(source.suppressions, desired.suppressions, current.suppressions, "suppression"));
  ops.push(...flagDeltas(source.detached, desired.detached, current.detached, "detachment"));
  return ops;
}
