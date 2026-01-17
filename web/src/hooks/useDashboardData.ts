import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowList, Workflow } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useSettingsStore } from "../stores/SettingsStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

/**
 * Hook to load and organize dashboard data including workflows and templates.
 * 
 * Fetches user workflows and example templates, then organizes them for display
 * on the dashboard. Templates tagged with "start" or "getting-started" are
 * identified as starter templates.
 * 
 * @returns Object containing:
 *   - isLoadingWorkflows: Whether workflows are currently loading
 *   - sortedWorkflows: User workflows sorted by name or update date
 *   - isLoadingTemplates: Whether templates are currently loading
 *   - startTemplates: Workflow templates suitable for new users
 * 
 * @example
 * ```typescript
 * const { 
 *   isLoadingWorkflows, 
 *   sortedWorkflows, 
 *   startTemplates 
 * } = useDashboardData();
 * 
 * if (isLoadingWorkflows) return <Loading />;
 * 
 * return (
 *   <div>
 *     <h2>Start Here</h2>
 *     {startTemplates.map(t => <TemplateCard key={t.id} template={t} />)}
 *     <h2>Your Workflows</h2>
 *     {sortedWorkflows.map(w => <WorkflowCard key={w.id} workflow={w} />)}
 *   </div>
 * );
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
