/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import SearchInput from "../search/SearchInput";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { useSearchParams } from "react-router-dom";
import { RenderGridView } from "./RenderGridView";
import { RenderListView } from "./RenderListView";

import {
  Typography,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Button
} from "@mui/material";

import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useCallback, useEffect, useState } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useNodeStore } from "../../stores/NodeStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";

const tile_width = "200px";
const tile_height = "200px";

const styles = (theme: any) =>
  css({
    ".tools": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "flex-start",
      margin: "2em 1em 1em 1.5em"
    },
    ".tools button": {
      fontSize: "0.7em",
      height: "2em"
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
      lineHeight: "1.2em",
      margin: "auto 0 0",
      fontSize: theme.fontSizeSmaller,
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

const WorkflowGrid = () => {
  const [filterValue, setFilterValue] = useState("");
  const { settings, setWorkflowLayout, setWorkflowOrder } = useSettingsStore(
    (state) => ({
      settings: state.settings,
      setWorkflowLayout: state.setWorkflowLayout,
      setWorkflowOrder: state.setWorkflowOrder
    })
  );
  const navigate = useNavigate();
  const { shiftKeyPressed, controlKeyPressed } = useKeyPressedStore(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("Shift"),
      controlKeyPressed: state.isKeyPressed("Control")
    })
  );
  const loadMyWorkflows = useWorkflowStore((state) => state.load);
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const copyWorkflow = useWorkflowStore((state) => state.copy);
  const updateWorkflow = useWorkflowStore((state) => state.update);
  const queryClient = useQueryClient();

  const setShouldAutoLayout = useNodeStore(
    (state) => state.setShouldAutoLayout
  );
  const handleLayoutChange = (_: any, newLayout: any) => {
    if (newLayout !== null) {
      setWorkflowLayout(newLayout);
    }
  };
  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);

  const { data, isLoading, error, isError } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => loadMyWorkflows("", 200)
  });

  const deleteWorkflow = useWorkflowStore((state) => state.delete);
  const [workflowsToDelete, setWorkflowsToDelete] = useState<Workflow[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);

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
  const onSelect = useCallback(
    (workflow: Workflow) => {
      const sortedWorkflows = [...(data?.workflows || [])].sort((a, b) => {
        if (settings.workflowOrder === "name") {
          return a.name.localeCompare(b.name);
        }
        return b.updated_at.localeCompare(a.updated_at);
      });

      if (
        selectedWorkflows.includes(workflow.id) &&
        !controlKeyPressed &&
        !shiftKeyPressed
      ) {
        setSelectedWorkflows([]);
      } else if (shiftKeyPressed) {
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
      } else if (controlKeyPressed) {
        setSelectedWorkflows((prev) =>
          prev.includes(workflow.id)
            ? prev.filter((id) => id !== workflow.id)
            : [...prev, workflow.id]
        );
      } else {
        setSelectedWorkflows([workflow.id]);
      }
    },
    [
      data?.workflows,
      shiftKeyPressed,
      controlKeyPressed,
      settings.workflowOrder,
      selectedWorkflows
    ]
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
  const handleCreateWorkflow = async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  };

  // DUPLICATE WORKFLOW
  const duplicateWorkflow = async (
    event: React.MouseEvent<Element>,
    workflow: Workflow
  ) => {
    event.stopPropagation();
    const newWorkflow = await copyWorkflow(workflow);
    const baseName = workflow.name.replace(/ \(\d+\)$/, "");
    const existingNames = (data?.workflows || [])
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
  };

  // DELETE WORKFLOW
  const onDelete = (e: any, workflow: Workflow) => {
    e.stopPropagation();
    let workflowsToDelete;
    if (selectedWorkflows.includes(workflow.id)) {
      // delete all selected workflows if the delete button is clicked on a selected workflow
      workflowsToDelete = (data?.workflows || []).filter((w) =>
        selectedWorkflows.includes(w.id)
      );
    } else {
      // only delete one to prevent accidental deletion of multiple workflows
      workflowsToDelete = [workflow];
    }
    setWorkflowsToDelete(workflowsToDelete);
    setIsDeleteDialogOpen(true);
  };

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

  // FILTER AND SORT WORKFLOWS
  const filteredAndSortedWorkflows =
    data?.workflows
      .filter(
        (workflow) =>
          workflow.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          workflow.description.toLowerCase().includes(filterValue.toLowerCase())
      )
      .sort((a, b) => {
        if (settings.workflowOrder === "name") {
          return a.name.localeCompare(b.name);
        }
        return b.updated_at.localeCompare(a.updated_at);
      }) || [];

  const handleSearchChange = (newSearchTerm: string) => {
    setFilterValue(newSearchTerm);
  };

  const workflowsToDeleteList = (
    <ul className="asset-names">
      {workflowsToDelete.map((workflow) => (
        <li key={workflow.id}>{workflow.name}</li>
      ))}
    </ul>
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
        <div className="tools">
          <Button variant="outlined" onClick={handleCreateWorkflow}>
            Create New
          </Button>
          <SearchInput
            onSearchChange={handleSearchChange}
            focusOnTyping={true}
          />
          <ToggleButtonGroup
            exclusive
            value={settings.workflowLayout}
            onChange={handleLayoutChange}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="grid">
              <ViewModuleIcon />
            </ToggleButton>
            <ToggleButton value="list">
              <FormatListBulletedIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            value={settings.workflowOrder}
            onChange={handleOrderChange}
            exclusive
            aria-label="Sort workflows"
          >
            <ToggleButton value="name" aria-label="Sort by name">
              Name
            </ToggleButton>
            <ToggleButton value="updated_at" aria-label="sort by date">
              Date
            </ToggleButton>
          </ToggleButtonGroup>
          {selectedWorkflows.length > 0 && (
            <Button
              className="delete-selected-button"
              onClick={() => {
                setWorkflowsToDelete(
                  (data?.workflows || []).filter((w) =>
                    selectedWorkflows.includes(w.id)
                  )
                );
                setIsDeleteDialogOpen(true);
              }}
            >
              Delete Selected
            </Button>
          )}
        </div>
        <div className="explanations">
          <Typography>
            <strong>Double-click a workflow</strong> to open it. Select multiple
            workflows for deletion by holding SHIFT or CONTROL keys.
          </Typography>
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
        <div className="workflow-items">
          {settings.workflowLayout === "grid" ? (
            <RenderGridView
              workflows={filteredAndSortedWorkflows}
              onClickOpen={onClickOpen}
              onDoubleClickWorkflow={onDoubleClickWorkflow}
              onDuplicateWorkflow={duplicateWorkflow}
              onDelete={onDelete}
              onSelect={onSelect}
              selectedWorkflows={selectedWorkflows}
              workflowCategory="user"
            />
          ) : (
            <RenderListView
              workflows={filteredAndSortedWorkflows}
              onClickOpen={onClickOpen}
              onDoubleClickWorkflow={onDoubleClickWorkflow}
              onDuplicateWorkflow={duplicateWorkflow}
              onDelete={onDelete}
              onSelect={onSelect}
              selectedWorkflows={selectedWorkflows}
              workflowCategory="user"
            />
          )}
        </div>
      </div>
    </>
  );
};

export default WorkflowGrid;
