/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, CircularProgress, Box, Tooltip, Fab } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
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
import { isEqual } from "lodash";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListView from "./WorkflowListView";
import WorkflowFormModal from "./WorkflowFormModal";
import { usePanelStore } from "../../stores/PanelStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      marginLeft: "0px"
    },

    ".toolbar-header": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      padding: "0.5em 0.75em",
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
      overflow: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: `${theme.vars.palette.c_scroll_thumb} ${theme.vars.palette.c_scroll_bg}`,
      "&::-webkit-scrollbar": { width: 10 },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.c_scroll_bg
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.c_scroll_thumb,
        borderRadius: 10,
        border: `2px solid ${theme.vars.palette.c_scroll_bg}`
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.c_scroll_hover
      }
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
      query: { cursor, limit, columns: "name,id,updated_at,description,tags" }
    }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workflows");
  }
  return data;
};

const WorkflowList = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const [workflowsToDelete, setWorkflowsToDelete] = useState<
    WorkflowAttributes[]
  >([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const { shiftKeyPressed, controlKeyPressed } = useKeyPressedStore(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("Shift"),
      controlKeyPressed: state.isKeyPressed("Control")
    })
  );
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const pageSize = 200;
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

  const workflows = useMemo(() => {
    if (filterValue === "") return data?.workflows || [];
    return (data?.workflows || []).filter((workflow) =>
      workflow.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [data?.workflows, filterValue]);

  const onSelect = useCallback((workflow: Workflow) => {
    // const sortedWorkflows = [...filteredWorkflows];
    // if (shiftKeyPressed) {
    //   if (selectedWorkflows.length > 0) {
    //     const lastSelected = selectedWorkflows[selectedWorkflows.length - 1];
    //     const lastIndex = sortedWorkflows.findIndex(
    //       (w) => w.id === lastSelected
    //     );
    //     const currentIndex = sortedWorkflows.findIndex(
    //       (w) => w.id === workflow.id
    //     );
    //     if (lastIndex !== undefined && currentIndex !== undefined) {
    //       const start = Math.min(lastIndex, currentIndex);
    //       const end = Math.max(lastIndex, currentIndex);
    //       const newSelection = sortedWorkflows
    //         .slice(start, end + 1)
    //         .map((w) => w.id);
    //       setSelectedWorkflows((prev) =>
    //         Array.from(new Set([...prev, ...newSelection]))
    //       );
    //     }
    //   } else {
    //     setSelectedWorkflows([workflow.id]);
    //   }
    // } else {
    setSelectedWorkflows((prev) =>
      prev.includes(workflow.id)
        ? prev.filter((id) => id !== workflow.id)
        : [...prev, workflow.id]
    );
    // }
  }, []);

  const onDeselect = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (controlKeyPressed || shiftKeyPressed) return;
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

  // DELETE WORKFLOW
  const onDelete = useCallback((workflow: Workflow) => {
    setWorkflowsToDelete([workflow]);
    setIsDeleteDialogOpen(true);
  }, []);

  useEffect(() => {
    document.addEventListener("click", onDeselect);
    return () => document.removeEventListener("click", onDeselect);
  }, [onDeselect]);

  const navigate = useNavigate();
  const { copyWorkflow, createWorkflow } = useWorkflowManager((state) => ({
    copyWorkflow: state.copy,
    createWorkflow: state.create
  }));
  const { createNew } = useWorkflowManager((state) => ({
    createNew: state.createNew
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

  const finalWorkflows = useMemo(() => {
    if (!selectedTag) return workflows;
    return workflows.filter((wf) => wf.tags?.includes(selectedTag));
  }, [workflows, selectedTag]);

  const handleEdit = useCallback((workflow: Workflow) => {
    setWorkflowToEdit(workflow);
  }, []);

  const handleCreateWorkflowTop = useCallback(async () => {
    const workflow = await createNew();
    navigate(`/editor/${workflow.id}`);
  }, [createNew, navigate]);

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
        <Tooltip title="Create a new workflow">
          <Fab
            variant="extended"
            onClick={handleCreateWorkflowTop}
            aria-label="New Workflow"
            sx={{
              width: "calc(100% - 20px)",
              margin: "10px",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              borderRadius: 12,
              color: (theme as any).vars.palette.grey[200],
              backgroundColor: "transparent",
              border: `1px solid ${(theme as any).vars.palette.grey[600]}`,
              boxShadow: "none",
              textTransform: "none",
              justifyContent: "center",
              transition:
                "all 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s ease",
              "&:hover": {
                backgroundColor: `${
                  (theme as any).vars.palette.primary.main
                }14`,
                borderColor: (theme as any).vars.palette.primary.main,
                boxShadow: `0 2px 8px rgba(0, 0, 0, 0.25)`
              },
              "&:active": {
                transform: "scale(0.99)"
              },
              "& svg": {
                position: "relative",
                zIndex: 1
              },
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "55%",
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.02) 60%, transparent)",
                pointerEvents: "none",
                zIndex: 0
              },
              "&::after": {
                content: '""',
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
                pointerEvents: "none"
              }
            }}
          >
            <AddIcon sx={{ mr: 1 }} /> New Workflow
          </Fab>
        </Tooltip>
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
            workflows={workflows}
            setFilterValue={setFilterValue}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            showCheckboxes={showCheckboxes}
            toggleCheckboxes={() => setShowCheckboxes((prev) => !prev)}
            selectedWorkflowsCount={selectedWorkflows.length}
            onBulkDelete={() => {
              setWorkflowsToDelete(
                workflows.filter((w) => selectedWorkflows.includes(w.id))
              );
              setIsDeleteDialogOpen(true);
            }}
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
        </div>
        <div className="workflow-items">
          {!isLoading && !isError && finalWorkflows.length === 0 ? (
            <div className="empty-state">
              <Typography variant="h6">No workflows yet</Typography>
              <Typography variant="body2">
                Create your first workflow with the + button above.
              </Typography>
            </div>
          ) : (
            <WorkflowListView
              workflows={finalWorkflows}
              onOpenWorkflow={handleOpenWorkflow}
              onDuplicateWorkflow={duplicateWorkflow}
              onDelete={onDelete}
              onEdit={handleEdit}
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
