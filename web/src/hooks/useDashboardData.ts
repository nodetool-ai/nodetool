import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowList, Workflow } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { trpcClient } from "../trpc/client";

const loadWorkflows = async () => {
  return trpcClient.workflows.list.query({
    cursor: "",
    limit: 20
  }) as unknown as WorkflowList;
};

/**
 * Custom hook for fetching dashboard data.
 * 
 * Loads workflows and templates from the API, providing sorted workflow lists
 * and filtered start templates for the dashboard. Uses TanStack Query for
 * data fetching and caching.
 * 
 * @returns Object containing loading states and data for workflows and templates
 * 
 * @example
 * ```typescript
 * const { isLoadingWorkflows, sortedWorkflows, startTemplates } = useDashboardData();
 * ```
 */
export const useDashboardData = () => {
  const settings = useSettingsStore((state) => state.settings);
  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);

  const { data: workflowsData, isLoading: isLoadingWorkflows } =
    useQuery<WorkflowList>({
      queryKey: ["workflows"],
      queryFn: loadWorkflows
    });

  const { data: examplesData, isLoading: isLoadingTemplates } =
    useQuery<WorkflowList>({
      queryKey: ["templates"],
      queryFn: loadTemplates
    });

  const startTemplates = useMemo(() => {
    const filtered =
      examplesData?.workflows.filter(
        (workflow: Workflow) =>
          workflow.tags?.includes("start") ||
          workflow.tags?.includes("getting-started")
      ) || [];
    // Deduplicate workflows by id to prevent duplicate key warnings
    const seen = new Set<string>();
    return filtered.filter((workflow: Workflow) => {
      if (seen.has(workflow.id)) {
        return false;
      }
      seen.add(workflow.id);
      return true;
    });
  }, [examplesData]);

  const sortedWorkflows = useMemo(() => {
    return (
      [...(workflowsData?.workflows || [])].sort((a, b) => {
        if (settings.workflowOrder === "name") {
          return a.name.localeCompare(b.name);
        }
        return b.updated_at.localeCompare(a.updated_at);
      })
    );
  }, [workflowsData, settings.workflowOrder]);

  return {
    isLoadingWorkflows,
    sortedWorkflows,
    isLoadingTemplates,
    startTemplates
  };
};
