/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import SearchInput from "../search/SearchInput";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { RenderListView } from "./RenderListView";

import { Typography, CircularProgress, Button, Tooltip } from "@mui/material";

import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useNodeStore } from "../../stores/NodeStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import AddIcon from "@mui/icons-material/Add";
import { useResizeObserver } from "@mantine/hooks";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { createErrorMessage } from "../../utils/errorHandling";
import { client } from "../../stores/ApiClient";

const tile_width = "200px";
const tile_height = "200px";

const styles = (theme: any) =>
  css({
    ".tools": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "center",
      margin: "2em 1em 1em 1.5em"
    },
    ".tools button": {
      fontSize: "0.7em"
    },
    ".filter": {
      width: "20em"
    },
    ".image-placeholder": {
      width: tile_width,
      height: tile_height,
      overflow: "hidden",
      position: "relative",
      backgroundColor: theme.palette.c_gray2,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "50vh",
      width: "100%"
    },
    ".workflow-items": {
      paddingTop: "2em"
    },
    ".workflow": {
      outline: `0px solid transparent`,
      outlineOffset: ".4em",
      transition: "outline 0.2s"
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.c_gray1,
      outline: "1px solid" + theme.palette.c_gray2
    },
    ".workflow.selected": {
      backgroundColor: theme.palette.c_gray1,
      outline: "1px solid" + theme.palette.c_hl1
    },
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".description": {
      lineHeight: "1.2em",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray6
    },
    ".date": {
      fontSize: theme.fontSizeTiny,
      color: theme.palette.c_gray5
    },
    ".status": { margin: "1em 1em 0 2em" },
    // Toggle category
    ".toggle-category": {
      display: "flex",
      flexDirection: "row",
      gap: "0",
      height: "2em",
      margin: "0"
    },
    ".workflow-buttons": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      justifyContent: "flex-start",
      margin: "2em 2em",
      alignItems: "center"
    },
    ".workflow-buttons .MuiToggleButton-root[aria-pressed='false']": {
      color: theme.palette.c_gray4
    },
    ".explanations": {
      margin: "-.5em 1em -1em 2em",
      padding: 0,
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray5
    }
  });

const loadWorkflows = async (cursor?: string, limit?: number) => {
  cursor = cursor || "";
  const { data, error } = await client.GET("/api/workflows/", {
    params: {
      query: { cursor, limit, columns: "name,id,updated_at,description" }
    }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workflows");
  }
  return data;
};

const WorkflowGrid = () => {
  const [filterValue, setFilterValue] = useState("");
  const navigate = useNavigate();
  const { shiftKeyPressed, controlKeyPressed } = useKeyPressedStore(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("Shift"),
      controlKeyPressed: state.isKeyPressed("Control")
    })
  );
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const copyWorkflow = useWorkflowStore((state) => state.copy);
  const updateWorkflow = useWorkflowStore((state) => state.update);
  const queryClient = useQueryClient();

  const setShouldAutoLayout = useNodeStore(
    (state) => state.setShouldAutoLayout
  );

  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const pageSize = 200;

  const { data, isLoading, error, isError } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: () => loadWorkflows("", pageSize),
    staleTime: 1000 * 60 * 15 // 15 minutes
  });
  const workflows = useMemo(() => data?.workflows || [], [data?.workflows]);
  const deleteWorkflow = useWorkflowStore((state) => state.delete);
  const [workflowsToDelete, setWorkflowsToDelete] = useState<Workflow[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [showCheckboxes, setShowCheckboxes] = useState(true);

  // OPEN WORKFLOW
  const onDoubleClickWorkflow = useCallback(
    (workflow: Workflow) => {
      setShouldAutoLayout(false);
      navigate("/editor/" + workflow.id);
    },
    [navigate, setShouldAutoLayout]
  );
  const onClickOpen = useCallback(
    (workflow: Workflow) => {
      if (controlKeyPressed || shiftKeyPressed) {
        return;
      }
      setShouldAutoLayout(false);
      navigate("/editor/" + workflow.id);
    },
    [navigate, setShouldAutoLayout, controlKeyPressed, shiftKeyPressed]
  );

  // SELECT WORKFLOW
  const filteredWorkflows = useMemo(() => {
    if (filterValue === "") {
      return workflows;
    }
    return workflows.filter((workflow) =>
      workflow.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [workflows, filterValue]);

  const onSelect = useCallback(
    (workflow: Workflow) => {
      const sortedWorkflows = [...filteredWorkflows];

      if (shiftKeyPressed) {
        if (selectedWorkflows.length > 0) {
          const lastSelected = selectedWorkflows[selectedWorkflows.length - 1];
          const lastIndex = sortedWorkflows.findIndex(
            (w) => w.id === lastSelected
          );
          const currentIndex = sortedWorkflows.findIndex(
            (w) => w.id === workflow.id
          );
          if (lastIndex !== undefined && currentIndex !== undefined) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const newSelection = sortedWorkflows
              .slice(start, end + 1)
              .map((w) => w.id);
            setSelectedWorkflows((prev) =>
              Array.from(new Set([...prev, ...newSelection]))
            );
          }
        } else {
          setSelectedWorkflows([workflow.id]);
        }
      } else {
        setSelectedWorkflows((prev) =>
          prev.includes(workflow.id)
            ? prev.filter((id) => id !== workflow.id)
            : [...prev, workflow.id]
        );
      }
    },
    [filteredWorkflows, shiftKeyPressed, selectedWorkflows]
  );

  const onDeselect = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (controlKeyPressed || shiftKeyPressed) {
        return;
      }

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

  useEffect(() => {
    document.addEventListener("click", onDeselect);
    return () => {
      document.removeEventListener("click", onDeselect);
    };
  }, [onDeselect]);

  // CREATE NEW WORKFLOW
  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow, queryClient]);

  // DUPLICATE WORKFLOW
  const duplicateWorkflow = useCallback(
    async (event: React.MouseEvent<Element>, workflow: Workflow) => {
      event.stopPropagation();
      const newWorkflow = await copyWorkflow(workflow);
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
      newWorkflow.name = newName.substring(0, 50);

      await updateWorkflow(newWorkflow);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
    [copyWorkflow, updateWorkflow, queryClient, workflows]
  );

  // DELETE WORKFLOW
  const onDelete = useCallback(
    (e: any, workflow: Workflow) => {
      e.stopPropagation();
      let workflowsToDelete;
      if (selectedWorkflows.includes(workflow.id)) {
        // delete all selected workflows if the delete button is clicked on a selected workflow
        workflowsToDelete = workflows.filter((w) =>
          selectedWorkflows.includes(w.id)
        );
      } else {
        // only delete one to prevent accidental deletion of multiple workflows
        workflowsToDelete = [workflow];
      }
      setWorkflowsToDelete(workflowsToDelete);
      setIsDeleteDialogOpen(true);
    },
    [selectedWorkflows, workflows]
  );

  const handleDelete = useCallback(() => {
    Promise.all(
      workflowsToDelete.map((workflow) => deleteWorkflow(workflow.id))
    )
      .then(() => {
        setIsDeleteDialogOpen(false);
        setWorkflowsToDelete([]);
        setSelectedWorkflows([]);
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
      })
      .catch((error) => {
        console.error("Error deleting workflows:", error);
      });
  }, [deleteWorkflow, workflowsToDelete, queryClient]);

  const handleSearchChange = useCallback(
    (newSearchTerm: string) => {
      setFilterValue(newSearchTerm);
    },
    [setFilterValue]
  );

  const workflowsToDeleteList = useMemo(
    () => (
      <ul className="asset-names">
        {workflowsToDelete.map((workflow) => (
          <li key={workflow.id}>{workflow.name}</li>
        ))}
      </ul>
    ),
    [workflowsToDelete]
  );

  // Add resize observer to handle responsive layout
  const [gridRef] = useResizeObserver();

  const workflowItems = useMemo(
    () => (
      <div className="workflow-items" ref={gridRef}>
        <RenderListView
          workflows={filteredWorkflows}
          onOpenWorkflow={onDoubleClickWorkflow}
          onDuplicateWorkflow={duplicateWorkflow}
          onDelete={onDelete}
          onSelect={onSelect}
          selectedWorkflows={selectedWorkflows}
          workflowCategory="user"
          showCheckboxes={showCheckboxes}
        />
      </div>
    ),
    [
      gridRef,
      filteredWorkflows,
      onClickOpen,
      onDoubleClickWorkflow,
      duplicateWorkflow,
      onDelete,
      onSelect,
      selectedWorkflows,
      showCheckboxes
    ]
  );

  const tools = useMemo(
    () => (
      <>
        <Typography variant="h3">Workflows</Typography>
        <div className="tools">
          <Tooltip title="Create a new workflow">
            <Button
              variant="outlined"
              onClick={handleCreateWorkflow}
              sx={{
                fontWeight: "bold",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                height: "36px",
                padding: "6px 16px"
              }}
            >
              <AddIcon />
            </Button>
          </Tooltip>
          <Tooltip title="Search workflows by name">
            <div>
              <SearchInput onSearchChange={handleSearchChange} />
            </div>
          </Tooltip>
          <Tooltip
            title={`${showCheckboxes ? "Hide" : "Show"} selection checkboxes`}
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              size="small"
              onClick={() => setShowCheckboxes(!showCheckboxes)}
              sx={{ height: "36px" }}
            >
              {showCheckboxes ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </Button>
          </Tooltip>
          {selectedWorkflows.length > 0 && (
            <Tooltip
              title={`Delete ${selectedWorkflows.length} selected workflow${
                selectedWorkflows.length > 1 ? "s" : ""
              }`}
            >
              <Button
                className="delete-selected-button"
                onClick={() => {
                  setWorkflowsToDelete(
                    workflows.filter((w) => selectedWorkflows.includes(w.id))
                  );
                  setIsDeleteDialogOpen(true);
                }}
                sx={{ height: "36px" }}
              >
                Delete Selected
              </Button>
            </Tooltip>
          )}
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
              <ErrorOutlineRounded>
                <Typography>{error?.message}</Typography>
              </ErrorOutlineRounded>
              <Typography>No workflows found.</Typography>
            </div>
          )}
        </div>
      </>
    ),
    [
      handleCreateWorkflow,
      handleSearchChange,
      selectedWorkflows,
      showCheckboxes,
      isLoading,
      isError,
      error?.message,
      workflows
    ]
  );

  return (
    <>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        confirmText="Delete"
        cancelText="Cancel"
        title="Delete Workflows"
        notificationMessage={`Workflows deleted`}
        notificationType="success"
        content={
          <>
            <p>Are you sure you want to delete the following workflows?</p>
            {workflowsToDeleteList}
          </>
        }
      />
      <div css={styles}>
        {tools}
        {workflowItems}
      </div>
    </>
  );
};

export default WorkflowGrid;
