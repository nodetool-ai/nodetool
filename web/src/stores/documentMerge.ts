/**
 * Document merge engine
 *
 * Three-way merge of an external document write into a dirty draft,
 * per merge unit (shot, clip, layer, line, node, edge — see CONTEXT.md).
 *
 * Inputs are three versions of one document: the base the editor last loaded
 * or saved, the draft holding the user's unsaved edits, and the server copy
 * that something else just wrote. Where both sides changed the same unit the
 * draft wins and the refused server value comes back as a conflict for the
 * document-level banner.
 *
 * The `ops` list (the `ui_*` operations the external write was made with)
 * scopes which units the write touched: a unit the draft and the server both
 * differ in but the write did not touch is not a conflict. Without ops the
 * write counts as a whole-document replacement: a dirty draft keeps
 * everything and emits one `replaced` conflict.
 *
 * Pure functions, no store access. Surfaces provide the adapter.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";

/** Why the draft refused an external value. */
export type MergeConflictReason = "edited" | "deleted" | "dangling" | "replaced";

/** The merge unit a conflict is about. */
export interface MergeConflictUnit {
  /** Unit kind, e.g. `"shot"`, `"clip"`, `"node"`, `"edge"`, `"document"`. */
  kind: string;
  id: string;
  label: string;
}

/** One external value a dirty draft refused. */
export interface MergeConflict {
  unit: MergeConflictUnit;
  /** The value the draft refused. Null for an external delete. */
  external: unknown;
  /** The draft value that won, when the banner shows both sides. */
  draft?: unknown;
  reason: MergeConflictReason;
}

export interface MergeResult<TDoc> {
  doc: TDoc;
  conflicts: MergeConflict[];
  /**
   * The base to merge the *next* external write against.
   *
   * It is the server document, except in the slots the draft refused, which
   * keep the base they had. Rolling those forward too would make the refusal
   * permanent and silent: the next write reads the refused slot as unchanged
   * on the server and changed by the draft, so the draft wins with nothing
   * listed and the external value can never be taken again.
   */
  nextBase: TDoc;
}

/**
 * A field of a unit the engine merges on its own instead of treating the
 * whole unit as one value. A field without `itemId` is one atomic value
 * (`node.position`); a field with `itemId` is a collection merged per item
 * (`line.takes`). Used where an external write touches one part of a unit the
 * draft edited elsewhere: a moved node with dirty data is not a conflict, a
 * take added to a line whose text is dirty is not a conflict.
 *
 * A collection-typed field can itself declare `fields`, merged per item —
 * script sections carry lines, lines carry takes.
 */
export interface MergeUnitField {
  field: string;
  itemId?: (item: unknown) => string;
  /** Nested per-item fields for a collection-typed field. */
  fields?: MergeUnitField[];
  /**
   * Emit item-level conflicts under this unit kind instead of bubbling the
   * contest to the owning unit. Declared on sub-collections whose items are
   * merge units in their own right (script `lines`, line `takes`), so
   * accepting one refused item never replaces its siblings.
   */
  conflictKind?: string;
  /** Label for an item-level conflict; defaults to the item id. */
  itemLabel?: (item: unknown) => string;
}

/**
 * One unit collection of a document: how to read and write it, and how to
 * identify and label a unit. Collections are merged by unit id; array order
 * follows the draft, with server-only units inserted at their server index.
 */
export interface MergeCollection<TDoc> {
  /** Unit kind, e.g. `"shot"` for the shots array. */
  kind: string;
  read(doc: TDoc): unknown[] | undefined;
  /** Return the document with the collection replaced. */
  write(doc: TDoc, units: unknown[]): TDoc;
  unitId(unit: unknown): string;
  unitLabel(unit: unknown): string;
  /** Unit fields merged at field level. Undeclared fields merge as one group. */
  unitFields?: MergeUnitField[];
}

/** A scalar document field the engine merges last-write-wins. */
export interface MergeScalarField<TDoc> {
  /** Field name, used in conflict labels. */
  name: string;
  read(doc: TDoc): unknown;
  /** Return the document with the field replaced. */
  write(doc: TDoc, value: unknown): TDoc;
}

export interface DocumentMergeAdapter<TDoc> {
  collections: MergeCollection<TDoc>[];
  scalars?: MergeScalarField<TDoc>[];
  /**
   * Map one external op onto the units it touched. An entry without `unitId`
   * touches every unit of the kind. An op nothing returns is unattributed and
   * falls back to diff-based touching for the units it actually changed.
   */
  unitsTouchedByOp?(op: DocumentOp): { kind: string; unitId?: string }[];
}

export interface MergeOptions {
  /** The ops the external write was made with, when the writer attached any. */
  ops?: DocumentOp[];
}

type TouchMap = Map<string, Set<string> | "all">;

/** Deep value equality, the comparison every merge decision is made on. */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => structuralEqual(item, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  const bb = b as Record<string, unknown>;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(bb, k) &&
      structuralEqual((a as Record<string, unknown>)[k], bb[k])
  );
}

/**
 * Which units the external write touched, per unit kind. With no ops every
 * kind counts as fully touched: the write replaces the whole document.
 */
function buildTouchMap<TDoc>(
  adapter: DocumentMergeAdapter<TDoc>,
  ops: DocumentOp[] | undefined
): { touched: TouchMap; hasOps: boolean; attributedAny: boolean } {
  if (!ops || ops.length === 0) {
    return { touched: new Map(), hasOps: false, attributedAny: false };
  }
  const touched: TouchMap = new Map();
  let attributedAny = false;
  if (adapter.unitsTouchedByOp) {
    for (const op of ops) {
      for (const hit of adapter.unitsTouchedByOp(op) ?? []) {
        attributedAny = true;
        if (!hit.unitId) {
          touched.set(hit.kind, "all");
          continue;
        }
        const set = touched.get(hit.kind);
        if (set === "all") continue;
        const next = set ?? new Set<string>();
        next.add(hit.unitId);
        touched.set(hit.kind, next);
      }
    }
  }
  // Ops arrived but none matched the adapter's vocabulary: fall back to
  // diff-based touching rather than ignoring the whole write.
  if (!attributedAny) touched.clear();
  return { touched, hasOps: true, attributedAny };
}

function touches(
  touched: TouchMap,
  hasOps: boolean,
  attributedAny: boolean,
  kind: string,
  unitId: string
): boolean {
  // Ops that no adapter rule attributed merge by diff alone: every slot
  // where base, draft and server genuinely disagree is a contest. (A write
  // with no ops at all never reaches here; mergeByUnits short-circuits it
  // into one replaced conflict.)
  if (!hasOps || !attributedAny) return true;
  const set = touched.get(kind);
  if (set === undefined) return false;
  if (set === "all") return true;
  return set.has(unitId);
}

interface Entry {
  item: unknown;
  index: number;
}

function listById(
  items: unknown[] | undefined,
  idOf: (item: unknown) => string
): Map<string, Entry> {
  const map = new Map<string, Entry>();
  (items ?? []).forEach((item, index) => {
    map.set(idOf(item), { item, index });
  });
  return map;
}

/**
 * Three-way decision for one atomic slot given its base/draft/server values.
 * Returns the winning value and whether the two sides genuinely disagree.
 * A slot the draft never touched always resolves to the server.
 */
function resolveSlot(
  baseValue: unknown,
  draftValue: unknown,
  serverValue: unknown
): { value: unknown; contested: boolean } {
  if (structuralEqual(draftValue, serverValue)) {
    return { value: draftValue, contested: false };
  }
  if (structuralEqual(draftValue, baseValue)) {
    return { value: serverValue, contested: false };
  }
  if (structuralEqual(serverValue, baseValue)) {
    return { value: draftValue, contested: false };
  }
  return { value: draftValue, contested: true };
}

/** The base one slot carries into the next merge. See `MergeResult.nextBase`. */
const nextBaseSlot = (
  baseValue: unknown,
  serverValue: unknown,
  contested: boolean
): unknown => (contested ? baseValue : serverValue);

/**
 * One refused external sub-item, reported by a field spec that declares
 * `conflictKind`. Shaped like a MergeConflict minus the label bookkeeping.
 */
export interface ReportedSubConflict {
  kind: string;
  id: string;
  label: string;
  external: unknown;
  draft?: unknown;
  reason: MergeConflictReason;
}

/**
 * Merge one unit at field level. A unit the draft never touched resolves
 * entirely to the server copy and cannot contest.
 *
 * `touched`/`hasOps` gate sub-collection item conflicts: a nested item both
 * sides changed only contests when the write actually touched it, addressed
 * by its path (`"section.lines"`). `pathPrefix` is the unit kind for
 * top-level calls and the parent path for nested ones.
 *
 * A sub-field declaring `conflictKind` reports its contests through `report`
 * as item-level conflicts; those do not bubble into the owning unit's own
 * contest flag. Everything else bubbles as before.
 */
function mergeByFieldSpecs(
  fields: MergeUnitField[],
  baseUnit: unknown,
  draftUnit: unknown,
  serverUnit: unknown,
  touchesSlot: (kind: string, unitId: string) => boolean,
  pathPrefix: string,
  unitIdForTouch: string,
  report?: (entry: ReportedSubConflict) => void
): {
  unit: Record<string, unknown>;
  contested: boolean;
  /** This unit's base for the next merge. See `MergeResult.nextBase`. */
  nextBase: Record<string, unknown>;
} {
  const declared = new Set(fields.map((f) => f.field));

  const pickRest = (unit: unknown): Record<string, unknown> => {
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(
      (unit ?? {}) as Record<string, unknown>
    )) {
      if (!declared.has(k)) rest[k] = v;
    }
    return rest;
  };

  const rest = resolveSlot(
    pickRest(baseUnit),
    pickRest(draftUnit),
    pickRest(serverUnit)
  );

  const unitTouched = touchesSlot(pathPrefix, unitIdForTouch);
  let contested = rest.contested && unitTouched;
  const resolved: Record<string, unknown> = {
    ...(rest.value as Record<string, unknown>)
  };
  // A slot the draft refused keeps its base whether or not the refusal was
  // listed: an unlisted one is just as unreachable if the base rolls past it.
  const nextBase: Record<string, unknown> = {
    ...(nextBaseSlot(
      pickRest(baseUnit),
      pickRest(serverUnit),
      rest.contested
    ) as Record<string, unknown>)
  };

  const childPath = (field: string): string =>
    pathPrefix ? `${pathPrefix}.${field}` : field;

  for (const spec of fields) {
    const read = (unit: unknown): unknown =>
      (unit as Record<string, unknown> | null | undefined)?.[spec.field];
    if (spec.itemId) {
      const itemId = spec.itemId;
      const readList = (unit: unknown): unknown[] =>
        ((read(unit) as unknown[] | undefined) ?? []);
      const baseSub = listById(readList(baseUnit), spec.itemId);
      const draftSub = listById(readList(draftUnit), spec.itemId);
      const serverSub = listById(readList(serverUnit), spec.itemId);
      const itemPath = childPath(spec.field);
      // A spec with conflictKind reports its own item-level conflicts; those
      // never bubble into the owning unit's contest flag.
      const reportItem =
        spec.conflictKind && report
          ? (
              id: string,
              labelSource: unknown,
              draft: unknown,
              external: unknown,
              reason: MergeConflictReason
            ): void => {
              report({
                kind: spec.conflictKind as string,
                id,
                label: spec.itemLabel ? spec.itemLabel(labelSource) : id,
                external,
                draft,
                reason
              });
            }
          : null;

      // Start from the draft's items; fold in what the server did.
      const mergedItems: unknown[] = [...readList(draftUnit)];
      let subContested = false;
      // Item ids whose external value the draft refused, so the field's next
      // base can keep theirs instead of rolling past the refusal.
      const refusedItems = new Set<string>();
      // Per-item next bases from a nested field spec, which computes its own.
      const nestedBases = new Map<string, Record<string, unknown>>();

      // Server additions, and server changes to an item the draft deleted.
      // Existence decides; ops do not gate these.
      for (const [id, sEntry] of serverSub) {
        const bEntry = baseSub.get(id);
        const dEntry = draftSub.get(id);
        if (!bEntry && !dEntry) {
          // Server-only addition.
          mergedItems.push(sEntry.item);
          continue;
        }
        if (!dEntry && bEntry) {
          // Draft deleted it; a changed server copy this write touched
          // contests the deletion, and the deletion stands (the draft wins).
          if (!structuralEqual(bEntry.item, sEntry.item)) {
            refusedItems.add(id);
            if (touchesSlot(itemPath, id)) {
              if (reportItem) {
                reportItem(id, sEntry.item, undefined, sEntry.item, "deleted");
              } else {
                subContested = true;
              }
            }
          }
        }
      }

      // Items the draft holds: three-way where every side has one, and
      // server deletions stand when the draft left the item untouched.
      for (let i = mergedItems.length - 1; i >= 0; i--) {
        const id = spec.itemId(mergedItems[i]);
        const draftItem = mergedItems[i];
        const bEntry = baseSub.get(id);
        const sEntry = serverSub.get(id);
        if (!sEntry) {
          if (bEntry && !structuralEqual(bEntry.item, draftItem)) {
            // External delete against a dirty item.
            refusedItems.add(id);
            if (reportItem) {
              if (touchesSlot(itemPath, id)) {
                reportItem(id, draftItem, draftItem, null, "deleted");
              }
            } else if (touchesSlot(itemPath, id)) {
              subContested = true;
            }
          } else {
            mergedItems.splice(i, 1); // uncontested external delete
          }
          continue;
        }
        if (!bEntry) {
          // Created in the draft; the server made its own version too.
          if (!structuralEqual(draftItem, sEntry.item)) {
            refusedItems.add(id);
            if (reportItem) {
              if (touchesSlot(itemPath, id)) {
                reportItem(id, draftItem, draftItem, sEntry.item, "edited");
              }
            } else if (touchesSlot(itemPath, id)) {
              subContested = true;
            }
          }
          continue;
        }
        if (spec.fields) {
          // Nested per-item merge (e.g. lines carry takes): recurse so an
          // external take added to a dirty line is not a conflict.
          const nested = mergeByFieldSpecs(
            spec.fields,
            bEntry.item,
            draftItem,
            sEntry.item,
            touchesSlot,
            itemPath,
            id,
            report
          );
          mergedItems[i] = nested.unit;
          nestedBases.set(id, nested.nextBase);
          if (nested.contested && touchesSlot(itemPath, id)) {
            if (reportItem) {
              reportItem(id, draftItem, draftItem, sEntry.item, "edited");
            } else {
              subContested = true;
            }
          }
          continue;
        }
        const outcome = resolveSlot(bEntry.item, draftItem, sEntry.item);
        mergedItems[i] = outcome.value;
        if (outcome.contested) {
          refusedItems.add(id);
          if (touchesSlot(itemPath, id)) {
            if (reportItem) {
              reportItem(id, outcome.value, outcome.value, sEntry.item, "edited");
            } else {
              subContested = true;
            }
          }
        }
      }

      resolved[spec.field] = mergedItems;
      // The field's next base follows the server's membership, so an item the
      // draft deleted is not resurrected as a server-only addition next time.
      nextBase[spec.field] = readList(serverUnit).map((item) => {
        const id = itemId(item);
        const nested = nestedBases.get(id);
        if (nested) return nested;
        return refusedItems.has(id) ? (baseSub.get(id)?.item ?? item) : item;
      });
      contested = contested || subContested;
    } else {
      const outcome = resolveSlot(
        read(baseUnit),
        read(draftUnit),
        read(serverUnit)
      );
      resolved[spec.field] = outcome.value;
      nextBase[spec.field] = nextBaseSlot(
        read(baseUnit),
        read(serverUnit),
        outcome.contested
      );
      contested = contested || (outcome.contested && unitTouched);
    }
  }

  return { unit: resolved, contested, nextBase };
}

/**
 * Merge one unit of a collection at field level. A unit the draft never
 * touched resolves entirely to the server copy and cannot contest. Item-level
 * conflicts reported by a `conflictKind` field surface through `report`.
 */
function mergeUnit(
  collection: MergeCollection<unknown>,
  baseUnit: unknown,
  draftUnit: unknown,
  serverUnit: unknown,
  touchesSlot: (kind: string, unitId: string) => boolean,
  unitId: string,
  report?: (entry: ReportedSubConflict) => void
): { unit: unknown; contested: boolean; nextBase: unknown } {
  return mergeByFieldSpecs(
    collection.unitFields ?? [],
    baseUnit,
    draftUnit,
    serverUnit,
    touchesSlot,
    collection.kind,
    unitId,
    report
  );
}

/**
 * Merge one unit collection by unit id. Order follows the draft, with
 * server-only units inserted at their server index. Appends conflicts the
 * draft caused by refusing a server value.
 */
function mergeCollection(
  collection: MergeCollection<unknown>,
  base: unknown,
  draft: unknown,
  server: unknown,
  touchesSlot: (kind: string, unitId: string) => boolean,
  conflicts: MergeConflict[]
): { units: unknown[]; nextBase: unknown[] } {
  const baseMap = listById(collection.read(base), collection.unitId);
  const draftList = collection.read(draft) ?? [];
  const draftMap = listById(draftList, collection.unitId);
  const serverMap = listById(collection.read(server), collection.unitId);
  const conflict = (
    id: string,
    label: string,
    external: unknown,
    reason: MergeConflictReason,
    draftValue?: unknown
  ): void => {
    conflicts.push({
      unit: { kind: collection.kind, id, label },
      external,
      draft: draftValue,
      reason
    });
  };
  const report = (entry: ReportedSubConflict): void => {
    conflicts.push({
      unit: { kind: entry.kind, id: entry.id, label: entry.label },
      external: entry.external,
      draft: entry.draft,
      reason: entry.reason
    });
  };

  const result: unknown[] = [];
  // Units whose external value the draft refused, and the merged base of a
  // unit that resolved field by field. Both feed the next-merge base below.
  const refused = new Set<string>();
  const mergedBases = new Map<string, unknown>();

  for (const [id, dEntry] of draftMap) {
    const bEntry = baseMap.get(id);
    const sEntry = serverMap.get(id);
    const draftChanged = bEntry
      ? !structuralEqual(bEntry.item, dEntry.item)
      : true;

    if (!sEntry) {
      if (!bEntry) {
        // Draft-only creation: the server has never seen it.
        result.push(dEntry.item);
        continue;
      }
      if (!draftChanged) continue; // external delete, draft untouched
      // External delete against a dirty draft unit: the draft survives. A
      // delete this write did not touch keeps the draft silently.
      refused.add(id);
      if (touchesSlot(collection.kind, id)) {
        conflict(
          id,
          collection.unitLabel(dEntry.item),
          null,
          "deleted",
          dEntry.item
        );
      }
      result.push(dEntry.item);
      continue;
    }

    if (!bEntry) {
      // Created on both sides. Same value → done; otherwise draft wins, and
      // only a unit this write touched is listed.
      if (!structuralEqual(dEntry.item, sEntry.item)) {
        refused.add(id);
        if (touchesSlot(collection.kind, id)) {
          conflict(
            id,
            collection.unitLabel(dEntry.item),
            sEntry.item,
            "edited",
            dEntry.item
          );
        }
      }
      result.push(dEntry.item);
      continue;
    }

    const serverChanged = !structuralEqual(bEntry.item, sEntry.item);
    if (!draftChanged) {
      if (!serverChanged) {
        result.push(dEntry.item);
        continue;
      }
      const takenFromServer = mergeUnit(
        collection,
        bEntry.item,
        dEntry.item,
        sEntry.item,
        touchesSlot,
        id,
        report
      );
      result.push(takenFromServer.unit);
      mergedBases.set(id, takenFromServer.nextBase);
      continue;
    }

    if (!serverChanged) {
      result.push(dEntry.item);
      continue;
    }

    // Both sides changed the unit. Field-level resolution keeps whatever the
    // write did not contest; a unit this write did not touch keeps the draft
    // silently — the drift arrives with its own write later. Contests a
    // conflictKind spec claimed are already in `conflicts`; the unit itself
    // stays uncontested so it is not listed twice.
    const merged = mergeUnit(
      collection,
      bEntry.item,
      dEntry.item,
      sEntry.item,
      touchesSlot,
      id,
      report
    );
    result.push(merged.unit);
    mergedBases.set(id, merged.nextBase);
    if (merged.contested) {
      conflict(
        id,
        collection.unitLabel(dEntry.item),
        sEntry.item,
        "edited",
        dEntry.item
      );
    }
  }

  // Server-only units: insert at their server index.
  const placed = new Set(result.map((u) => collection.unitId(u)));
  for (const [id, sEntry] of serverMap) {
    if (placed.has(id)) continue;
    if (baseMap.has(id)) continue; // draft deleted it; deletion stands
    result.splice(Math.min(sEntry.index, result.length), 0, sEntry.item);
    placed.add(id);
  }

  // The next base follows the server's membership — a unit the draft deleted
  // must stay in it, or the next merge reads it as a server-only addition and
  // resurrects it — and keeps the base of every unit the draft refused.
  const nextBase = [...serverMap.values()].map(({ item }) => {
    const id = collection.unitId(item);
    const fieldMerged = mergedBases.get(id);
    if (fieldMerged !== undefined) return fieldMerged;
    return refused.has(id) ? (baseMap.get(id)?.item ?? item) : item;
  });

  return { units: result, nextBase };
}

/**
 * Three-way merge of one document. `base` is what the editor last loaded or
 * saved, `draft` the user's copy, `server` the external write. Never mutates
 * its inputs; the returned document shares structure with whichever side won
 * each unit.
 */
export function mergeByUnits<TDoc>(
  base: TDoc,
  draft: TDoc,
  server: TDoc,
  adapter: DocumentMergeAdapter<TDoc>,
  options?: MergeOptions
): MergeResult<TDoc> {
  const { touched, hasOps, attributedAny } = buildTouchMap(
    adapter,
    options?.ops
  );
  const touchesSlot = (kind: string, unitId: string): boolean =>
    touches(touched, hasOps, attributedAny, kind, unitId);

  // A write with no ops (another tab's autosave, a CLI restore) is one merge
  // unit: a dirty draft keeps everything and lists one conflict. Ops the
  // adapter could not attribute do NOT take this path — they merge by diff.
  if (!hasOps) {
    return {
      doc: draft,
      // The draft took none of it, so none of it becomes the next base.
      nextBase: base,
      conflicts: [
        {
          unit: { kind: "document", id: "document", label: "document" },
          external: server,
          reason: "replaced"
        }
      ]
    };
  }

  const conflicts: MergeConflict[] = [];
  let doc = draft;
  let nextBase = server;

  for (const collection of adapter.collections) {
    const original = collection.read(draft);
    const merged = mergeCollection(
      collection,
      base,
      draft,
      server,
      touchesSlot,
      conflicts
    );
    nextBase = collection.write(nextBase, merged.nextBase);
    if (
      original &&
      merged.units.length === original.length &&
      merged.units.every((unit, i) => unit === original[i])
    ) {
      continue;
    }
    doc = collection.write(doc, merged.units);
  }

  for (const scalar of adapter.scalars ?? []) {
    const outcome = resolveSlot(
      scalar.read(base),
      scalar.read(draft),
      scalar.read(server)
    );
    doc = scalar.write(doc, outcome.value);
    nextBase = scalar.write(
      nextBase,
      nextBaseSlot(scalar.read(base), scalar.read(server), outcome.contested)
    );
    if (outcome.contested && touchesSlot("field", scalar.name)) {
      conflicts.push({
        unit: { kind: "field", id: scalar.name, label: scalar.name },
        external: scalar.read(server),
        draft: outcome.value,
        reason: "edited"
      });
    }
  }

  return { doc, conflicts, nextBase };
}
