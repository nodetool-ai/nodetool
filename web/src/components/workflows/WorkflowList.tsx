/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
import { isEqual } from "lodash";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListView from "./WorkflowListView";
import WorkflowFormModal from "./WorkflowFormModal";
import { usePanelStore } from "../../stores/PanelStore";

const styles = (theme: any) =>
  css({
    "&": {
      marginLeft: "0px"
    },
    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "50vh",
      width: "100%"
    },
    ".status": {
      margin: "1em 1em 0 2em"
    },
    ".workflow-items": {
      paddingTop: "0.5em"
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
      color: theme.palette.grey[200]
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
      <div css={styles}>
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
        </div>
      </div>
    </>
  );
};

export default memo(WorkflowList, isEqual);
