import { useMemo } from "react";
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
  | "jsscript";

export interface DocumentTreeLeaf {
  readonly id: string;
  readonly name: string;
  readonly type: DocumentTreeLeafType;
  readonly typeLabel: string;
  readonly projectId?: string;
  readonly entity?: Entity;
}

export interface DocumentTreeGroup {
  readonly id: "workflows" | "apps" | "creative" | "agents";
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
const UNTITLED: Record<DocumentTreeLeafType, string> = {
  workflow: "Untitled workflow",
  application: "Untitled app",
  sketch: "Untitled sketch",
  script: "Untitled script",
  storyboard: "Untitled storyboard",
  timeline: "Untitled video",
  entity: "Untitled entity",
  jsscript: "Untitled JS script"
};

const TYPE_LABELS: Record<DocumentTreeLeafType, string> = {
  workflow: "Workflow",
  application: "App",
  sketch: "Sketch",
  script: "Script",
  storyboard: "Storyboard",
  timeline: "Timeline",
  entity: "Entity",
  jsscript: "JS script"
};

/**
 * The groups, and the kinds each one holds in the order it shows them. The
 * index arrives newest-first across every kind at once, so a group's order
 * comes from partitioning it by kind rather than from the order it arrived in.
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
    types: ["sketch", "script", "storyboard", "timeline", "entity"]
  },
  { id: "agents", label: "Agents & code", types: ["jsscript"] }
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

  const groups = useMemo<readonly DocumentTreeGroup[]>(() => {
    const byType = new Map<DocumentTreeLeafType, DocumentTreeLeaf[]>();
    for (const document of indexQuery.data?.documents ?? []) {
      const type = document.type;
      const leaves = byType.get(type) ?? [];
      leaves.push({
        id: document.id,
        name: document.name || UNTITLED[type],
        type,
        typeLabel: TYPE_LABELS[type],
        projectId,
        entity: document.entity
      });
      byType.set(type, leaves);
    }
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
