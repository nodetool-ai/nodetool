/**
 * useDocumentConflicts
 *
 * Reads the conflict list an external merge registered for one open document
 * and returns ready-to-mount props for the {@link ConflictBanner}. Accept and
 * discard delegate to the resolvers the merging sync hook registered.
 */
import { useConflictStore } from "../stores/ConflictStore";
import type { MergeConflict } from "../stores/documentMerge";

/** Stable identity for the no-conflicts case, so selectors stay referential. */
const NO_CONFLICTS: MergeConflict[] = [];

/**
 * The refused external value as readable text, when it is one. Code
 * conflicts carry their body as a string; structured values would render as
 * noise and are left out.
 */
const externalDetail = (conflict: MergeConflict): string | undefined =>
  typeof conflict.external === "string" ? conflict.external : undefined;

/** One-line description of a refused external value, for the banner. */
function conflictBannerLabel(conflict: MergeConflict): string {
  switch (conflict.reason) {
    case "replaced":
      return "The whole document was replaced outside the editor";
    case "deleted":
      return `${conflict.unit.label} — deleted outside while you were editing it`;
    case "dangling":
      return `${conflict.unit.label} — refers to something you deleted`;
    default:
      return `${conflict.unit.label} — changed outside while you were editing it`;
  }
}

interface DocumentConflictItem {
  unitId: string;
  label: string;
  reason: MergeConflict["reason"];
  /** The refused value as text, when it is worth reading in full. */
  detail?: string;
  /** The draft value as text, shown beside `detail` for a two-pane view. */
  draftDetail?: string;
}

interface DocumentConflicts {
  items: DocumentConflictItem[];
  /** Take the external value into the draft (an undoable user edit). */
  accept: (unitId: string) => void;
  /** Keep the draft version and drop the offer. */
  discard: (unitId: string) => void;
}

/**
 * The conflicts for one open document, shaped for `ConflictBanner`.
 */
export function useDocumentConflicts(
  /** The backend `resource_type` spelling, e.g. `"workflow"`, `"storyboard"`. */
  type: string,
  id: string
): DocumentConflicts {
  const key = `${type}:${id}`;
  const conflicts = useConflictStore(
    (state) => state.byKey[key]?.conflicts ?? NO_CONFLICTS
  );
  // A handful of rows per document: plain mapping, no memoization.
  const items: DocumentConflictItem[] = conflicts.map((conflict) => ({
    unitId: conflict.unit.id,
    label: conflictBannerLabel(conflict),
    reason: conflict.reason,
    detail: externalDetail(conflict),
    draftDetail:
      typeof conflict.draft === "string" ? conflict.draft : undefined
  }));
  return {
    items,
    accept: (unitId) => useConflictStore.getState().accept(key, unitId),
    discard: (unitId) => useConflictStore.getState().discard(key, unitId)
  };
}
