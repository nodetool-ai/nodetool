import { useMemo, useRef } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { trpc } from "../trpc/client";

export type DocumentTreeLeafType =
  | "workflow"
  | "application"
  | "sketch"
  | "script"
  | "storyboard"
  | "timeline"
  | "entity"
  | "jsscript"
  | "game"
  | "text";

export interface DocumentTreeLeaf {
  readonly id: string;
  readonly name: string;
  readonly type: DocumentTreeLeafType;
  readonly typeLabel: string;
  readonly projectId?: string;
  readonly entity?: Entity;
  /** Set on a document another user shared with the caller: their role. */
  readonly sharedRole?: "viewer" | "editor";
}

export interface DocumentTreeGroup {
  readonly id:
    | "workflows"
    | "apps"
    | "creative"
    | "text"
    | "agents"
    | "entities"
    | "shared";
  readonly label: string;
  readonly children: readonly DocumentTreeLeaf[];
}

export interface UseDocumentTreeDataResult {
  readonly groups: readonly DocumentTreeGroup[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
}

const INDEX_STALE_TIME = 30_000;

/** Fallback shown when a document was saved without a name. */
export const UNTITLED_DOCUMENT_NAMES: Record<DocumentTreeLeafType, string> = {
  workflow: "Untitled workflow",
  application: "Untitled app",
  sketch: "Untitled sketch",
  script: "Untitled script",
  storyboard: "Untitled storyboard",
  timeline: "Untitled video",
  entity: "Untitled entity",
  jsscript: "Untitled JS script",
  game: "Untitled game",
  text: "Untitled text file"
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentTreeLeafType, string> = {
  workflow: "Workflow",
  application: "App",
  sketch: "Sketch",
  script: "Script",
  storyboard: "Storyboard",
  timeline: "Timeline",
  entity: "Entity",
  jsscript: "JS script",
  game: "Game",
  text: "Text file"
};

/**
 * The groups, and the kinds each one holds in the order it shows them. The
 * index arrives newest-first across every kind at once, so a group's order
 * comes from partitioning it by kind rather than from the order it arrived in.
 *
 * Every group but Entities holds the kinds the home documents strip counts,
 * so the panel and the strip agree on what a document is. Entities open in
 * place rather than as a tab, and the strip does not list them, so they get a
 * group of their own instead of sitting among the documents.
 */
const GROUPS: readonly {
  readonly id: DocumentTreeGroup["id"];
  readonly label: string;
  readonly types: readonly DocumentTreeLeafType[];
}[] = [
  { id: "workflows", label: "Workflows", types: ["workflow"] },
  { id: "apps", label: "Apps", types: ["application"] },
  {
    id: "creative",
    label: "Creative documents",
    types: ["sketch", "script", "storyboard", "timeline", "game"]
  },
  { id: "text", label: "Text files", types: ["text"] },
  { id: "agents", label: "Agents & code", types: ["jsscript"] },
  { id: "entities", label: "Entities", types: ["entity"] }
];

/**
 * Collects the project documents that can be opened from the left rail.
 * Individual list panels retain their richer editing and bulk-action UI; this
 * hook intentionally exposes only the stable identity needed by a navigator.
 *
 * One request serves the whole tree. Asking each per-kind list endpoint
 * instead meant eight round trips whose answers carried entire documents —
 * graphs, boards, sketch layers — to render a name apiece, and the panel stayed
 * on its spinner until the slowest of them returned.
 */
export const useDocumentTreeData = (
  projectId: string
): UseDocumentTreeDataResult => {
  const indexQuery = trpc.documents.index.useQuery(
    { projectId },
    { staleTime: INDEX_STALE_TIME, retry: false }
  );

  // Every save refetches the index as new objects. A row re-renders when its
  // leaf is a new object, and a project holds hundreds of rows, so a document
  // the refetch did not change keeps the leaf it had.
  const leafCache = useRef(new Map<string, DocumentTreeLeaf>());

  const groups = useMemo<readonly DocumentTreeGroup[]>(() => {
    const previous = leafCache.current;
    const next = new Map<string, DocumentTreeLeaf>();
    const byType = new Map<DocumentTreeLeafType, DocumentTreeLeaf[]>();
    for (const document of indexQuery.data?.documents ?? []) {
      const type = document.type;
      const key = `${type}:${document.id}`;
      const name = document.name || UNTITLED_DOCUMENT_NAMES[type];
      const cached = previous.get(key);
      const leaf =
        cached &&
        cached.name === name &&
        cached.projectId === projectId &&
        cached.entity === document.entity
          ? cached
          : {
              id: document.id,
              name,
              type,
              typeLabel: DOCUMENT_TYPE_LABELS[type],
              projectId,
              entity: document.entity
            };
      next.set(key, leaf);
      const leaves = byType.get(type) ?? [];
      leaves.push(leaf);
      byType.set(type, leaves);
    }
    leafCache.current = next;
    return GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      children: group.types.flatMap((type) => byType.get(type) ?? [])
    })).filter((group) => group.children.length > 0);
  }, [indexQuery.data, projectId]);

  const error = indexQuery.error instanceof Error ? indexQuery.error : null;

  return {
    groups,
    isLoading: indexQuery.isLoading,
    isError: Boolean(error),
    error
  };
};
