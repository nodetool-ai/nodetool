import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowList, Workflow } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useSettingsStore } from "../stores/SettingsStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

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
 * Hook for loading dashboard data including workflows and templates.
 * 
 * Fetches the user's workflows and available templates from the API,
 * then derives sorted workflows based on user settings and identifies
 * start/getting-started templates for onboarding.
 * 
 * @returns Dashboard data including loading states and derived lists
 * 
 * @example
 * ```typescript
 * const { 
 *   isLoadingWorkflows, 
 *   sortedWorkflows,
 *   isLoadingTemplates,
 *   startTemplates 
 * } = useDashboardData();
 * 
 * // Display in UI
 * {isLoadingWorkflows ? <Loading /> : <WorkflowList workflows={sortedWorkflows} />}
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
    /** Whether workflows are currently loading */
    isLoadingWorkflows,
    /** Workflows sorted according to user settings */
    sortedWorkflows,
    /** Whether templates are currently loading */
    isLoadingTemplates,
    /** Templates tagged with "start" or "getting-started" for onboarding */
    startTemplates
  };
};
