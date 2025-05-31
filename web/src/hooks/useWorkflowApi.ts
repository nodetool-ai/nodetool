import { useCallback } from "react";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { WorkflowList } from "../stores/ApiTypes";

export const useWorkflowApi = () => {
  const loadWorkflows = useCallback(
    async (cursor = "", limit?: number): Promise<WorkflowList> => {
      const { data, error } = await client.GET("/api/workflows/", {
        params: { query: { cursor, limit, columns: "name,id,updated_at,description,tags" } }
      });
      if (error) {
        throw createErrorMessage(error, "Failed to load workflows");
      }
      return data as WorkflowList;
    },
    []
  );

  return { loadWorkflows };
};
