import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Entity } from "@nodetool-ai/protocol";
import { useShallow } from "zustand/react/shallow";

import useGlobalChatStore from "../stores/GlobalChatStore";
import { useEntities } from "../serverState/useEntities";
import { workflowListQueryKey } from "../serverState/workflowQueryKeys";
import { trpc, trpcClient } from "../trpc/client";
import type { RouterOutputs } from "../trpc/client";
import { useApplications } from "./useApplications";
import { useJsScripts } from "./jsScript/useJsScripts";
import { useScripts } from "./script/useScripts";
import { useStoryboards } from "./storyboard/useStoryboards";
import { useTimelines } from "./useTimelineSequence";

type WorkflowListType = RouterOutputs["workflows"]["list"];

export type DocumentTreeLeafType =
  | "workflow"
  | "application"
  | "sketch"
  | "script"
  | "storyboard"
  | "timeline"
  | "entity"
  | "chat"
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

const WORKFLOW_LIST_PAGE_SIZE = 1000;

const loadWorkflows = async (projectId: string): Promise<WorkflowListType> =>
  trpcClient.workflows.list.query({
    cursor: "",
    limit: WORKFLOW_LIST_PAGE_SIZE,
    project_id: projectId
  });

const leaf = (
  id: string,
  name: string,
  type: DocumentTreeLeafType,
  typeLabel: string,
  options: Pick<DocumentTreeLeaf, "projectId" | "entity"> = {}
): DocumentTreeLeaf => ({
  id,
  name,
  type,
  typeLabel,
  ...options
});

/**
 * Collects the project documents that can be opened from the left rail.
 * Individual list panels retain their richer editing and bulk-action UI; this
 * hook intentionally exposes only the stable identity needed by a navigator.
 */
export const useDocumentTreeData = (
  projectId: string
): UseDocumentTreeDataResult => {
  const workflowsQuery = useQuery<WorkflowListType, Error>({
    queryKey: workflowListQueryKey(WORKFLOW_LIST_PAGE_SIZE, "", projectId),
    queryFn: () => loadWorkflows(projectId),
    staleTime: 15 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false
  });
  const sketchesQuery = trpc.sketch.list.useQuery(
    { projectId },
    { staleTime: 30_000, retry: false }
  );
  const scriptsQuery = useScripts(projectId);
  const storyboardsQuery = useStoryboards(projectId);
  const timelinesQuery = useTimelines(projectId);
  const entitiesQuery = useEntities(projectId);
  const jsScriptsQuery = useJsScripts(projectId);
  const applicationsQuery = useApplications(projectId);
  const { threads, isLoadingThreads, error: threadsError } =
    useGlobalChatStore(
      useShallow((state) => ({
        threads: state.threads,
        isLoadingThreads: state.isLoadingThreads,
        error: state.error
      }))
    );

  const groups = useMemo<readonly DocumentTreeGroup[]>(() => {
    const workflows = (workflowsQuery.data?.workflows ?? []).map(
      (workflow) =>
        leaf(
          workflow.id,
          workflow.name || "Untitled workflow",
          "workflow",
          "Workflow",
          { projectId }
        )
    );
    const applications = (applicationsQuery.data ?? []).map((application) =>
      leaf(
        application.id,
        application.name || "Untitled app",
        "application",
        "App",
        { projectId }
      )
    );
    const creative = [
      ...(sketchesQuery.data ?? []).map((sketch) =>
        leaf(sketch.id, sketch.name || "Untitled sketch", "sketch", "Sketch", {
          projectId
        })
      ),
      ...(scriptsQuery.data ?? []).map((script) =>
        leaf(script.id, script.name || "Untitled script", "script", "Script", {
          projectId
        })
      ),
      ...(storyboardsQuery.data ?? []).map((storyboard) =>
        leaf(
          storyboard.id,
          storyboard.name || "Untitled storyboard",
          "storyboard",
          "Storyboard",
          { projectId }
        )
      ),
      ...(timelinesQuery.data ?? []).map((timeline) =>
        leaf(
          timeline.id,
          timeline.name || "Untitled video",
          "timeline",
          "Timeline",
          { projectId }
        )
      ),
      ...(entitiesQuery.data ?? []).map((entity) =>
        leaf(entity.id, entity.name || "Untitled entity", "entity", "Entity", {
          projectId,
          entity
        })
      )
    ];
    const agents = [
      ...Object.values(threads)
        .filter((thread) => (thread.project_id ?? "default") === projectId)
        .map((thread) =>
          leaf(thread.id, thread.title || "New chat", "chat", "Chat", {
            projectId
          })
        ),
      ...(jsScriptsQuery.data ?? []).map((script) =>
        leaf(
          script.id,
          script.name || "Untitled JS script",
          "jsscript",
          "JS script",
          { projectId }
        )
      )
    ];

    const allGroups: DocumentTreeGroup[] = [
      { id: "workflows", label: "Workflows", children: workflows },
      { id: "apps", label: "Apps", children: applications },
      { id: "creative", label: "Creative documents", children: creative },
      { id: "agents", label: "Agents & code", children: agents }
    ];
    return allGroups.filter((group) => group.children.length > 0);
  }, [
    applicationsQuery.data,
    entitiesQuery.data,
    jsScriptsQuery.data,
    projectId,
    scriptsQuery.data,
    sketchesQuery.data,
    storyboardsQuery.data,
    threads,
    timelinesQuery.data,
    workflowsQuery.data
  ]);

  const queryErrors = [
    workflowsQuery.error,
    sketchesQuery.error,
    scriptsQuery.error,
    storyboardsQuery.error,
    timelinesQuery.error,
    entitiesQuery.error,
    jsScriptsQuery.error,
    applicationsQuery.error
  ];
  const error =
    queryErrors.find(
      (queryError): queryError is Error => queryError instanceof Error
    ) ?? (threadsError ? new Error(threadsError) : null);
  const isError = Boolean(error);

  return {
    groups,
    isLoading:
      isLoadingThreads ||
      workflowsQuery.isLoading ||
      sketchesQuery.isLoading ||
      scriptsQuery.isLoading ||
      storyboardsQuery.isLoading ||
      timelinesQuery.isLoading ||
      entitiesQuery.isLoading ||
      jsScriptsQuery.isLoading ||
      applicationsQuery.isLoading,
    isError,
    error
  };
};
