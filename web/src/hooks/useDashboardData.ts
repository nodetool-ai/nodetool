import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowList, Workflow } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useSettingsStore } from "../stores/SettingsStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

/**
 * Fetches workflow and template data for the dashboard.
 * 
 * This hook loads user workflows and example templates using React Query,
 * providing reactive loading states and memoized sorting/filtering.
 * 
 * @returns Object containing loading states and filtered/sorted workflow data
 * 
 * @example
 * ```typescript
 * const { isLoadingWorkflows, sortedWorkflows, isLoadingTemplates, startTemplates } = useDashboardData();
 * ```
 */
const loadWorkflows = async () => {
  const { data, error } = await client.GET("/api/workflows/", {
    params: {
      query: {
        cursor: "",
        limit: 20,
        columns: "name,id,updated_at,description,thumbnail_url"
      }
    }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workflows");
  }
  return data;
};

/**
 * Hook to fetch and organize dashboard data including workflows and templates.
 * 
 * Uses TanStack Query for efficient data fetching with caching and provides:
 * - Loading states for workflows and templates
 * - Sorted workflows based on user preferences (name or date)
 * - Filtered "start" templates for quick onboarding
 * 
 * @returns Dashboard data object with loading states and sorted workflow lists
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
    return (
      examplesData?.workflows.filter(
        (workflow: Workflow) =>
          workflow.tags?.includes("start") ||
          workflow.tags?.includes("getting-started")
      ) || []
    );
  }, [examplesData]);

  const sortedWorkflows = useMemo(() => {
    return (
      workflowsData?.workflows.sort((a, b) => {
        if (settings.workflowOrder === "name") {
          return a.name.localeCompare(b.name);
        }
        return b.updated_at.localeCompare(a.updated_at);
      }) || []
    );
  }, [workflowsData, settings.workflowOrder]);

  return {
    isLoadingWorkflows,
    sortedWorkflows,
    isLoadingTemplates,
    startTemplates
  };
};
