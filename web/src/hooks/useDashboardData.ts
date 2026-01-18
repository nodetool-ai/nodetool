import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowList, Workflow } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useSettingsStore } from "../stores/SettingsStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

/**
 * Hook that fetches and processes data for the dashboard.
 * 
 * Loads workflows from the API, loads templates from the workflow manager,
 * and provides sorted/filtered lists for display. Handles loading states
 * and sorting based on user preferences.
 * 
 * @returns Object with loading states and processed workflow/template lists
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
 * // Display recent workflows
 * sortedWorkflows.map(w => <WorkflowTile workflow={w} />);
 * 
 * // Display starter templates
 * startTemplates.map(t => <TemplateCard template={t} />);
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
