/**
 * The Studio home feed: the user's storyboards, scripts and timelines, folded
 * into one card per project by {@link groupLinkedProjects}.
 *
 * The list endpoints carry no link fields, so the pointers come from the
 * detail queries of the most recent scripts and boards — batched by the tRPC
 * http link, cached per document revision, and never blocking: until they
 * settle every document stands alone, which is exactly what the grouping does
 * with an empty link map.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";
import { useStoryboards } from "../hooks/storyboard/useStoryboards";
import { useScripts } from "../hooks/script/useScripts";
import { useTimelines } from "../hooks/useTimelineSequence";
import {
  groupLinkedProjects,
  studioDocumentKey,
  type StudioDocument,
  type StudioDocumentLinks,
  type StudioProject
} from "./groupLinkedProjects";

/** How many documents deep the home feed resolves links for. */
const LINK_LOOKUP_LIMIT = 24;

const fetchLinks = async (
  document: StudioDocument
): Promise<StudioDocumentLinks> => {
  if (document.kind === "script") {
    const script = await trpcClient.scripts.get.query({ id: document.id });
    return {
      storyboardId: script.storyboardId ?? null,
      timelineId: script.timelineId ?? null
    };
  }
  const board = await trpcClient.storyboards.get.query({ id: document.id });
  // The screenplay is a passthrough zod object, so its `script_id` arrives
  // as widely as the schema allows; only a string is a link.
  const scriptId = board.document.screenplay?.script_id;
  return {
    scriptId: typeof scriptId === "string" ? scriptId : null,
    timelineId: board.timelineId ?? null
  };
};

export interface UseStudioProjectsResult {
  projects: StudioProject[];
  loading: boolean;
}

export const useStudioProjects = (): UseStudioProjectsResult => {
  const storyboards = useStoryboards();
  const scripts = useScripts();
  // No project filter: storyboards and scripts list all the user's documents,
  // so the merged feed scopes timelines the same way.
  const timelines = useTimelines();

  const documents = useMemo<StudioDocument[]>(
    () => [
      ...(storyboards.data ?? []).map((s) => ({
        kind: "storyboard" as const,
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt
      })),
      ...(scripts.data ?? []).map((s) => ({
        kind: "script" as const,
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt
      })),
      ...(timelines.data ?? []).map((t) => ({
        kind: "timeline" as const,
        id: t.id,
        name: t.name,
        updatedAt: t.updatedAt
      }))
    ],
    [storyboards.data, scripts.data, timelines.data]
  );

  // Only scripts and boards carry pointers; a timeline is always pointed at.
  const linked = useMemo(
    () =>
      documents
        .filter((document) => document.kind !== "timeline")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, LINK_LOOKUP_LIMIT),
    [documents]
  );

  const linkQueries = useQueries({
    queries: linked.map((document) => ({
      // The revision is part of the key: a saved link invalidates itself.
      queryKey: [
        "studio-links",
        document.kind,
        document.id,
        document.updatedAt
      ],
      queryFn: () => fetchLinks(document),
      staleTime: 30_000,
      retry: false
    }))
  });

  const links = useMemo(() => {
    const map: Record<string, StudioDocumentLinks> = {};
    linked.forEach((document, index) => {
      const data = linkQueries[index]?.data;
      if (data) map[studioDocumentKey(document)] = data;
    });
    return map;
  }, [linked, linkQueries]);

  const projects = useMemo(
    () => groupLinkedProjects(documents, links),
    [documents, links]
  );

  return {
    projects,
    loading: storyboards.isLoading || scripts.isLoading || timelines.isLoading
  };
};

export default useStudioProjects;
