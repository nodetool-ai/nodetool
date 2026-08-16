/**
 * Studio home grouping (design §4).
 *
 * A script, the storyboard it links, and the timeline either produced are one
 * project, not three documents. This folds the three flat lists into one card
 * per project by walking the link pointers, and keeps every unlinked document
 * as a project of its own.
 *
 * A pointer at a document that is not in the lists is ignored, so a group
 * whose counterpart was deleted collapses to the survivors instead of naming
 * something that is gone — the same read the deletion downgrades leave behind
 * when they cannot reach the far side (`lib/scriptStoryboardDowngrade.ts`).
 */

export type StudioDocumentKind = "storyboard" | "script" | "timeline";

export interface StudioDocument {
  kind: StudioDocumentKind;
  id: string;
  name: string;
  /** ISO timestamp, as every list item reports it. */
  updatedAt: string;
}

/** What one document points at. Unknown or absent fields mean "no link". */
export interface StudioDocumentLinks {
  /** Set on a storyboard: the script its words come from. */
  scriptId?: string | null;
  /** Set on a script: the board derived from it. */
  storyboardId?: string | null;
  /** Set on either: the sequence it was assembled into. */
  timelineId?: string | null;
}

export interface StudioProject {
  /** Stable React key: the leading document's `kind:id`. */
  key: string;
  /** The project's name — the leading document's. */
  name: string;
  /** Newest `updatedAt` in the group. */
  updatedAt: string;
  /** Every document in the group, storyboard → script → timeline. */
  documents: StudioDocument[];
  /** Where the card opens: the document touched most recently. */
  primary: StudioDocument;
}

export const studioDocumentKey = (document: {
  kind: StudioDocumentKind;
  id: string;
}): string => `${document.kind}:${document.id}`;

/**
 * Which document leads a project: the board is the visual spine, the script
 * the words behind it, the timeline the cut that came out.
 */
const KIND_ORDER: Record<StudioDocumentKind, number> = {
  storyboard: 0,
  script: 1,
  timeline: 2
};

const byKindThenRecency = (a: StudioDocument, b: StudioDocument): number =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  b.updatedAt.localeCompare(a.updatedAt) ||
  a.id.localeCompare(b.id);

const byRecencyThenKind = (a: StudioDocument, b: StudioDocument): number =>
  b.updatedAt.localeCompare(a.updatedAt) ||
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  a.id.localeCompare(b.id);

class DisjointSet {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    const seen = this.parent.get(key);
    if (seen === undefined) {
      this.parent.set(key, key);
      return key;
    }
    if (seen === key) return key;
    const root = this.find(seen);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

/**
 * Fold `documents` into project groups using `links`, keyed by
 * {@link studioDocumentKey}. Pure: the same inputs always give the same
 * grouping and the same order (newest project first).
 */
export function groupLinkedProjects(
  documents: readonly StudioDocument[],
  links: Readonly<Record<string, StudioDocumentLinks>> = {}
): StudioProject[] {
  const byKey = new Map<string, StudioDocument>();
  for (const document of documents) {
    byKey.set(studioDocumentKey(document), document);
  }

  const sets = new DisjointSet();
  for (const [key, document] of byKey) {
    const link = links[key];
    if (!link) continue;
    const counterparts = [
      document.kind === "script" && link.storyboardId
        ? `storyboard:${link.storyboardId}`
        : null,
      document.kind === "storyboard" && link.scriptId
        ? `script:${link.scriptId}`
        : null,
      link.timelineId ? `timeline:${link.timelineId}` : null
    ];
    for (const counterpart of counterparts) {
      // A pointer at a document nobody listed is dangling: the survivors keep
      // their own card rather than the group naming a deleted document.
      if (counterpart && byKey.has(counterpart)) sets.union(key, counterpart);
    }
  }

  const groups = new Map<string, StudioDocument[]>();
  for (const [key, document] of byKey) {
    const root = sets.find(key);
    const group = groups.get(root);
    if (group) {
      group.push(document);
    } else {
      groups.set(root, [document]);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort(byKindThenRecency);
      const primary = [...ordered].sort(byRecencyThenKind)[0];
      return {
        key: studioDocumentKey(ordered[0]),
        name: ordered[0].name,
        updatedAt: primary.updatedAt,
        documents: ordered,
        primary
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key));
}

export default groupLinkedProjects;
