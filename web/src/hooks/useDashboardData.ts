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
 * Custom hook for loading dashboard data including workflows and templates.
 * 
 * Uses TanStack Query to fetch workflow lists and template data with
 * automatic caching and loading states. Provides sorted workflows
 * based on user settings and filters start templates by tags.
 * 
 * @returns Object containing:
 *   - isLoadingWorkflows: Whether workflows are currently loading
 *   - sortedWorkflows: Array of workflows sorted by name or date
 *   - isLoadingTemplates: Whether templates are currently loading
 *   - startTemplates: Array of getting-started templates (tagged "start" or "getting-started")
 * 
 * @example
 * ```typescript
 * const { 
 *   isLoadingWorkflows, 
 *   sortedWorkflows, 
 *   startTemplates 
 * } = useDashboardData();
 * 
 * if (isLoadingWorkflows) {
 *   return <LoadingSpinner />;
 * }
 * 
 * return (
 *   <div>
 *     {sortedWorkflows.map(w => <WorkflowCard key={w.id} workflow={w} />)}
 *   </div>
 * );
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
    isLoadingWorkflows,
    sortedWorkflows,
    isLoadingTemplates,
    startTemplates
  };
};
