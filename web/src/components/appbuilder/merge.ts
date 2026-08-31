/**
 * Application merge adapter
 *
 * Teaches the generic per-unit merge engine about a mini-app document.
 *
 * Puck stores nested components inside slot props, so the document is a tree;
 * the adapter flattens that tree into one merge unit per component (every
 * component carries its parent id and slot), merges per unit id, and rebuilds
 * the tree afterwards. A child whose parent no longer exists is dropped and
 * reported as dangling. `operations[]`, `variables[]` and `resources[]` are
 * units by id; the root props (title, theme) are last-write-wins.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeConflict,
  MergeResult
} from "../../stores/documentMerge";
import { mergeByUnits } from "../../stores/documentMerge";

/** One flattened component: the Puck node plus where it hangs. */
interface FlatComponent {
  node: { type: string; props: Record<string, unknown> & { id: string } };
  parentId: string | null;
  slot: string | null;
}

/**
 * The slice of an application document the engine merges. `content` is the
 * FLAT component list on the way in (`appDocumentToMerge`) and the rebuilt
 * Puck tree on the way out (the adapter's write rebuilds it), so a merged
 * result drops straight back into `ui.content`.
 */
interface AppMergeDoc {
  content: unknown[];
  operations: unknown[];
  variables: unknown[];
  resources: unknown[];
  rootProps: unknown;
  zones: unknown;
}

type AnyNode = Record<string, unknown>;

const isRecord = (v: unknown): v is AnyNode =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Structural slot detection without the Puck config: an array of objects
 * that all look like Puck nodes (`{type, props: {id}}`). Generated apps only
 * ever nest through real slots, so this matches what the editor produces.
 */
const isSlotArray = (value: unknown): value is AnyNode[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item["type"] === "string" &&
      isRecord(item["props"]) &&
      typeof (item["props"] as AnyNode)["id"] === "string"
  );

type ComponentNodeLike = {
  type: string;
  props: Record<string, unknown> & { id: string };
};

/** Flatten a Puck content tree into per-component merge units. */
function flattenAppComponents(content: unknown[]): FlatComponent[] {
  const out: FlatComponent[] = [];
  const walk = (
    items: AnyNode[],
    parentId: string | null,
    slot: string | null
  ): void => {
    for (const item of items) {
      const rawProps = (item["props"] ?? {}) as Record<string, unknown>;
      const id = String(rawProps["id"]);
      // Slot arrays come out of the parent's unit value: children are their
      // own units, so editing a child must not dirty the parent and a parent
      // removal must not decide the child's fate.
      const ownSlots: [string, AnyNode[]][] = [];
      const props: Record<string, unknown> & { id: string } = { id };
      for (const [key, value] of Object.entries(rawProps)) {
        if (isSlotArray(value)) {
          ownSlots.push([key, value]);
          continue;
        }
        props[key] = value;
      }
      out.push({
        node: { type: item["type"] as string, props },
        parentId,
        slot
      });
      for (const [key, childItems] of ownSlots) {
        walk(childItems, id, key);
      }
    }
  };
  walk(content as AnyNode[], null, null);
  return out;
}

/**
 * Rebuild the Puck content tree from merged flat units. Roots keep their
 * merged order; children hang off their parent's slot in merged order.
 */
function rebuildAppComponents(flat: FlatComponent[]): unknown[] {
  // Drop units whose parent is gone (recursively: a dropped child can
  // orphan its own children).
  let kept = [...flat];
  for (;;) {
    const ids = new Set(kept.map((entry) => entry.node.props.id));
    const next = kept.filter(
      (entry) => entry.parentId === null || ids.has(entry.parentId)
    );
    if (next.length === kept.length) break;
    kept = next;
  }

  const byId = new Map<string, FlatComponent>();
  const children = new Map<string, Map<string, FlatComponent[]>>();
  const roots: ComponentNodeLike[] = [];
  for (const entry of kept) {
    byId.set(entry.node.props.id, entry);
    if (entry.parentId !== null && entry.slot !== null) {
      const perSlot = children.get(entry.parentId) ?? new Map();
      const list = perSlot.get(entry.slot) ?? [];
      list.push(entry);
      perSlot.set(entry.slot, list);
      children.set(entry.parentId, perSlot);
    }
  }
  // Second pass so a child placed under any parent resolves to the clone.
  for (const entry of kept) {
    const perSlot = children.get(entry.node.props.id);
    if (!perSlot) continue;
    const props: Record<string, unknown> & { id: string } = {
      ...entry.node.props
    };
    for (const [slot, list] of perSlot) {
      props[slot] = list.map((child) => child.node);
    }
    const node: ComponentNodeLike = { type: entry.node.type, props };
    byId.set(entry.node.props.id, { ...entry, node });
  }
  for (const entry of kept) {
    if (entry.parentId === null) roots.push(byId.get(entry.node.props.id)!.node);
  }
  return roots;
}

const flatUnitId = (unit: unknown): string => {
  const entry = unit as FlatComponent;
  return String(entry?.node?.props?.id ?? "");
};

const flatUnitLabel = (unit: unknown): string => {
  const entry = unit as FlatComponent;
  return `${entry?.node?.type ?? "component"} ${flatUnitId(unit)}`;
};

const byId = (unit: unknown): string =>
  String((unit as { id?: unknown }).id ?? "");

const named = (unit: unknown): string => {
  const unitRecord = unit as { name?: unknown };
  return String(unitRecord.name ?? byId(unit));
};

const appMergeAdapter: DocumentMergeAdapter<AppMergeDoc> = {
  collections: [
    {
      kind: "component",
      read: (doc) => doc.content,
      write: (doc, content) => ({
        ...doc,
        content: rebuildAppComponents(content as FlatComponent[])
      }),
      unitId: flatUnitId,
      unitLabel: flatUnitLabel
    },
    {
      kind: "operation",
      read: (doc) => doc.operations,
      write: (doc, operations) => ({ ...doc, operations }),
      unitId: byId,
      unitLabel: named
    },
    {
      kind: "variable",
      read: (doc) => doc.variables,
      write: (doc, variables) => ({ ...doc, variables }),
      unitId: byId,
      unitLabel: named
    },
    {
      kind: "resource",
      read: (doc) => doc.resources,
      write: (doc, resources) => ({ ...doc, resources }),
      unitId: byId,
      unitLabel: named
    }
  ],
  scalars: [
    {
      name: "root",
      read: (doc) => doc.rootProps,
      write: (doc, value) => ({ ...doc, rootProps: value })
    },
    {
      name: "zones",
      read: (doc) => doc.zones,
      write: (doc, value) => ({ ...doc, zones: value })
    }
  ],
  unitsTouchedByOp: (op): { kind: string; unitId?: string }[] => {
    const input = (op.input ?? {}) as Record<string, unknown>;
    const target =
      [input["component_id"], input["id"], input["target"]].find(
        (v) => typeof v === "string" && v.length > 0
      ) ?? undefined;
    switch (op.tool) {
      case "ui_app_update_component":
      case "ui_app_remove_component":
      case "ui_app_select_component":
        return typeof target === "string"
          ? [{ kind: "component", unitId: target }]
          : [];
      case "ui_app_set_title":
        // The title lives in the root props scalar.
        return [{ kind: "field", unitId: "root" }];
      case "ui_app_add_operation":
      case "ui_app_remove_operation":
        // Existence decides; no attribution needed.
        return [];
      default:
        return [];
    }
  }
};

/**
 * Merge one external application write into the dirty draft. After the
 * per-unit merge, a component kept in the draft while its parent was removed
 * externally comes back as a dangling conflict and is dropped from the tree.
 */
export function mergeAppDocuments(
  base: AppMergeDoc,
  draft: AppMergeDoc,
  server: AppMergeDoc,
  ops?: DocumentOp[]
): MergeResult<AppMergeDoc> {
  // Capture the engine's flat component output so orphaned units can be
  // reported before the adapter rebuilds the tree without them.
  const captured: { flat: FlatComponent[] | null } = { flat: null };
  const capturingAdapter: DocumentMergeAdapter<AppMergeDoc> = {
    ...appMergeAdapter,
    collections: appMergeAdapter.collections.map((collection) =>
      collection.kind === "component"
        ? {
            ...collection,
            write: (doc, content) => {
              captured.flat = content as FlatComponent[];
              return collection.write(doc, content);
            }
          }
        : collection
    )
  };

  const result = mergeByUnits(base, draft, server, capturingAdapter, { ops });
  const mergedFlat = captured.flat;
  if (!mergedFlat) return result;

  // Walk to a fixpoint: dropping an orphan can orphan its own children.
  const dangling: MergeConflict[] = [];
  const deadIds = new Set<string>();
  let alive = new Set(mergedFlat.map((entry) => entry.node.props.id));
  for (;;) {
    const drops = mergedFlat.filter(
      (entry) =>
        alive.has(entry.node.props.id) &&
        entry.parentId !== null &&
        !alive.has(entry.parentId)
    );
    if (drops.length === 0) break;
    for (const entry of drops) {
      alive.delete(entry.node.props.id);
      deadIds.add(entry.node.props.id);
      dangling.push({
        unit: {
          kind: "component",
          id: entry.node.props.id,
          label: flatUnitLabel(entry)
        },
        external: null,
        reason: "dangling"
      });
    }
  }
  if (deadIds.size === 0) return result;

  // An orphan supersedes whatever the engine offered for it (a "deleted"
  // offer for a child whose parent is gone cannot be honoured).
  const surviving = result.conflicts.filter(
    (conflict) => !deadIds.has(conflict.unit.id)
  );
  return {
    doc: result.doc,
    nextBase: result.nextBase,
    conflicts: [...surviving, ...dangling]
  };
}

/**
 * Project an application document onto the slice the engine merges. The
 * Puck tree flattens so nested components merge as their own units.
 */
export function appDocumentToMerge(
  doc: import("@nodetool-ai/app-runtime").ApplicationDocument
): AppMergeDoc {
  const ui = doc.ui as {
    content?: unknown[];
    zones?: unknown;
    root?: { props?: unknown };
  };
  return {
    content: flattenAppComponents(ui.content ?? []),
    operations: doc.operations ?? [],
    variables: doc.variables ?? [],
    resources: doc.resources ?? [],
    rootProps: ui.root?.props ?? {},
    zones: ui.zones ?? {}
  };
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortedKeys(record[key]);
    }
    return out;
  }
  return value;
}

/** Stable fingerprint of the merge slice, so Puck key-order is not dirty. */
export function appDocumentFingerprint(
  doc: import("@nodetool-ai/app-runtime").ApplicationDocument
): string {
  return JSON.stringify(sortedKeys(appDocumentToMerge(doc)));
}
