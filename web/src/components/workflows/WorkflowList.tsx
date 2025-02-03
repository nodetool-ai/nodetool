/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Typography, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useState, useMemo, memo } from "react";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import WorkflowToolbar from "./WorkflowToolbar";
import WorkflowGrid from "./WorkflowGrid";
import WorkflowDeleteDialog from "./WorkflowDeleteDialog";
import {
  Workflow,
  WorkflowAttributes,
  WorkflowList as WorkflowListType
} from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import { isEqual } from "lodash";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";

const tile_width = "200px";
const tile_height = "200px";

const styles = (theme: any) =>
  css({
    "&": {
      marginLeft: "20px"
    },
    ".tools": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "center",
      margin: "0"
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
      paddingTop: "0.5em"
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
    },
    ".workflow-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2, 0),
      "& h3": {
        margin: 0,
        fontSize: "1.5rem",
        color: theme.palette.c_white
      }
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
  const { removeWorkflow } = useWorkflowManager((state) => ({
    removeWorkflow: state.removeWorkflow
  }));
  const { shiftKeyPressed, controlKeyPressed } = useKeyPressedStore(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("Shift"),
      controlKeyPressed: state.isKeyPressed("Control")
    })
  );
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const pageSize = 200;

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
  const workflows = useMemo(() => data?.workflows || [], [data?.workflows]);
  const listWorkflows = useWorkflowManager((state) => state.listWorkflows);

  const filteredWorkflows = useMemo(() => {
    if (filterValue === "") return listWorkflows();
    return listWorkflows().filter((workflow) =>
      workflow.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [listWorkflows, filterValue]);

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
    // let workflowsToDelete;
    // if (selectedWorkflows.includes(workflow.id)) {
    //   // delete all selected workflows if the delete button is clicked on a selected workflow
    //   workflowsToDelete = workflows.filter((w) =>
    //     selectedWorkflows.includes(w.id)
    //   );
    // } else {
    //   // only delete one to prevent accidental deletion of multiple workflows
    //   workflowsToDelete = [workflow];
    // }
    setWorkflowsToDelete([workflow]);
    setIsDeleteDialogOpen(true);
  }, []);

  useEffect(() => {
    document.addEventListener("click", onDeselect);
    return () => document.removeEventListener("click", onDeselect);
  }, [onDeselect]);

  return (
    <>
      <WorkflowDeleteDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        workflowsToDelete={workflowsToDelete}
      />
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
              listWorkflows().filter((w) => selectedWorkflows.includes(w.id))
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
        <WorkflowGrid
          selectedTag={selectedTag}
          workflows={workflows}
          onSelect={onSelect}
          selectedWorkflows={selectedWorkflows}
          showCheckboxes={showCheckboxes}
          onDelete={onDelete}
        />
      </div>
    </>
  );
};

export default memo(WorkflowList, isEqual);
