/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useState, useMemo, memo } from "react";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import WorkflowToolbar from "./WorkflowToolbar";
import WorkflowDeleteDialog from "./WorkflowDeleteDialog";
import {
  Workflow,
  WorkflowAttributes,
  WorkflowList as WorkflowListType
} from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import isEqual from "lodash/isEqual";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListView from "./WorkflowListView";
import WorkflowFormModal from "./WorkflowFormModal";
import { usePanelStore } from "../../stores/PanelStore";
import { useFavoriteWorkflowIds } from "../../stores/FavoriteWorkflowsStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: "0px",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    },

    ".toolbar-header": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      padding: "0.5em 0",
      background: "transparent",
      backdropFilter: "blur(4px)",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },

    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "45vh",
      width: "100%",
      gap: "0.75em",
      color: theme.vars.palette.grey[0]
    },
    ".status": {
      margin: "0.5em 0.75em 0 0.75em",
      color: theme.vars.palette.grey[300]
    },
    ".workflow-items": {
      padding: "0.5em 0.75em 0.75em",
      flex: 1,
      overflow: "hidden"
    },
    // Toggle category
    ".toggle-category": {
      display: "flex",
      flexDirection: "row",
      gap: "0",
      height: "2em",
      margin: "0"
    },
    ".explanations": {
      margin: "-.5em 1em -1em 2em",
      padding: 0,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[200]
    },

    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5em",
      padding: "2em 1em",
      color: theme.vars.palette.grey[300]
    }
  });

const loadWorkflows = async (cursor?: string, limit?: number) => {
  cursor = cursor || "";
  const { data, error } = await client.GET("/api/workflows/", {
    params: {
      query: { cursor, limit, columns: "name,id,updated_at,description,tags,graph" }
    }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workflows");
  }
  return data;
};

const WorkflowList = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [filterValue, setFilterValue] = useState("");
  const [workflowsToDelete, setWorkflowsToDelete] = useState<
    WorkflowAttributes[]
  >([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { shiftKeyPressed, controlKeyPressed } = useKeyPressedStore(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("Shift"),
      controlKeyPressed: state.isKeyPressed("Control")
    })
  );
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const pageSize = 1000;
  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);

  const { data, isLoading, error, isError } = useQuery<WorkflowListType, Error>(
    {
      queryKey: ["workflows"],
      queryFn: () => loadWorkflows("", pageSize),
      staleTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false
    }
  );

  const favoriteWorkflowIds = useFavoriteWorkflowIds();

  const workflows = useMemo(() => {
    if (!data?.workflows) {return [];}
    let filtered = data.workflows;

    if (filterValue !== "") {
      const filterValueLower = filterValue.toLowerCase();
      filtered = filtered.filter((workflow) =>
        workflow.name.toLowerCase().includes(filterValueLower)
      );
    }

    if (showFavoritesOnly) {
      filtered = filtered.filter((workflow) =>
        favoriteWorkflowIds.includes(workflow.id)
      );
    }

    return filtered;
  }, [data?.workflows, filterValue, showFavoritesOnly, favoriteWorkflowIds]);

  const onSelect = useCallback((workflow: Workflow) => {
    setSelectedWorkflows((prev) =>
      prev.includes(workflow.id)
        ? prev.filter((id) => id !== workflow.id)
        : [...prev, workflow.id]
    );
  }, []);

  const onDeselect = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (controlKeyPressed || shiftKeyPressed) { return; }
      if (
        !target.closest(".workflow") &&
        !target.closest(".MuiDialog-root") &&
        !target.closest(".delete-selected-button")
      ) {
        setSelectedWorkflows([]);
      }
    },
    [controlKeyPressed, shiftKeyPressed]
  );

  const onDelete = useCallback((workflow: Workflow) => {
    setWorkflowsToDelete([workflow]);
    setIsDeleteDialogOpen(true);
  }, []);

  useEffect(() => {
    document.addEventListener("click", onDeselect);
    return () => document.removeEventListener("click", onDeselect);
  }, [onDeselect]);

  const navigate = useNavigate();
  const { copyWorkflow, createWorkflow, updateWorkflow, getWorkflow } = useWorkflowManager((state) => ({
    copyWorkflow: state.copy,
    createWorkflow: state.create,
    updateWorkflow: state.updateWorkflow,
    getWorkflow: state.getWorkflow
  }));


  const handleOpenWorkflow = useCallback(
    (workflow: Workflow) => {
      navigate("/editor/" + workflow.id);
      usePanelStore.getState().setVisibility(false);
    },
    [navigate]
  );

  const duplicateWorkflow = useCallback(
    async (event: React.MouseEvent, workflow: Workflow) => {
      event.stopPropagation();
      const workflowRequest = await copyWorkflow(workflow);
      const baseName = workflow.name.replace(/ \(\d+\)$/, "");
      const existingNames = workflows
        .filter((w) => w.name.startsWith(baseName))
        .map((w) => w.name);
      let highestNumber = 0;
      const regex = new RegExp(`^${baseName} \\((\\d+)\\)$`);
      existingNames.forEach((name) => {
        const match = name.match(regex);
        if (match && match[1]) {
          const number = parseInt(match[1], 10);
          if (number > highestNumber) {
            highestNumber = number;
          }
        }
      });
      const newName = `${baseName} (${highestNumber + 1})`;
      workflowRequest.name = newName.substring(0, 50);
      const newWorkflow = await createWorkflow(workflowRequest);
      navigate(`/editor/${newWorkflow.id}`);
    },
    [copyWorkflow, createWorkflow, workflows, navigate]
  );

  const handleEdit = useCallback((workflow: Workflow) => {
    setWorkflowToEdit(workflow);
  }, []);

  const handleRename = useCallback(
    async (workflow: Workflow, newName: string) => {
      try {
        await client.PUT("/api/workflows/{id}", {
          params: { path: { id: workflow.id } },
          body: { ...workflow, name: newName }
        });
        // Update the cache optimistically
        queryClient.setQueryData<WorkflowListType>(["workflows"], (old) => {
          if (!old) {return old;}
          return {
            ...old,
            workflows: old.workflows.map((w) =>
              w.id === workflow.id ? { ...w, name: newName } : w
            )
          };
        });
        // Also update the workflow manager if this workflow is open (updates tabs)
        const openWorkflow = getWorkflow(workflow.id);
        if (openWorkflow) {
          updateWorkflow({ ...openWorkflow, name: newName });
        }
      } catch (err) {
        console.error("Failed to rename workflow:", err);
      }
    },
    [queryClient, getWorkflow, updateWorkflow]
  );

  const handleToggleFavorites = useCallback(() => {
    setShowFavoritesOnly((prev) => !prev);
  }, []);



  return (
    <>
      <WorkflowDeleteDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        workflowsToDelete={workflowsToDelete}
      />
      {workflowToEdit && (
        <WorkflowFormModal
          open={!!workflowToEdit}
          onClose={() => setWorkflowToEdit(null)}
          workflow={workflowToEdit}
        />
      )}
      <div css={styles(theme)}>
        <div
          className="toolbar-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75em",
            justifyContent: "space-between"
          }}
        >
          <WorkflowToolbar
            setFilterValue={setFilterValue}
            showCheckboxes={showCheckboxes}
            toggleCheckboxes={() => setShowCheckboxes((prev) => !prev)}
            selectedWorkflowsCount={selectedWorkflows.length}
            onBulkDelete={() => {
              setWorkflowsToDelete(
                workflows.filter((w) => selectedWorkflows.includes(w.id))
              );
              setIsDeleteDialogOpen(true);
            }}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavorites={handleToggleFavorites}
          />
        </div>
        <div className="status">
          {isLoading && (
            <div className="loading-indicator">
              <CircularProgress />
              <Typography variant="h4">Loading Workflows</Typography>
            </div>
          )}
          {isError && (
            <div style={{ display: "flex", gap: "1em", alignItems: "center" }}>
              <ErrorOutlineRounded />
              <Typography>{error?.message}</Typography>
              <Typography>No workflows found.</Typography>
            </div>
          )}
          {showFavoritesOnly && workflows.length === 0 && !isLoading && !isError && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
              No favorite workflows. Click the star icon on a workflow to add it to your favorites.
            </Typography>
          )}
        </div>
        <div className="workflow-items">
          {!isLoading && !isError && workflows.length === 0 ? (
            <div className="empty-state">
              <Typography variant="h6">No workflows yet</Typography>
              <Typography variant="body2">
                Create your first workflow with the + button above.
              </Typography>
            </div>
          ) : (
            <WorkflowListView
              workflows={workflows}
              onOpenWorkflow={handleOpenWorkflow}
              onDuplicateWorkflow={duplicateWorkflow}
              onDelete={onDelete}
              onEdit={handleEdit}
              onRename={handleRename}
              onSelect={onSelect}
              selectedWorkflows={selectedWorkflows}
              workflowCategory="user"
              showCheckboxes={showCheckboxes}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default memo(WorkflowList, isEqual);
