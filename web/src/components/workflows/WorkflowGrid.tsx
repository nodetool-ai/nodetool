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
import { useQuery, useQueryClient } from "react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useNodeStore } from "../../stores/NodeStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import useKeyPressedListener from "../../utils/KeyPressedListener";

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
      fontSize: "0.75em",
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

      margin: "0.25em 0 0",
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
      margin: "0 1em 1em 2em",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray5
    }
  });

type WorkflowCategory = "user" | "examples";

const WorkflowGrid = () => {
  const [filterValue, setFilterValue] = useState("");
  const { settings, setWorkflowLayout, setWorkflowOrder } = useSettingsStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shiftKeyPressed = useKeyPressedListener("Shift");
  const controlKeyPressed = useKeyPressedListener("Control");
  const loadMyWorkflows = useWorkflowStore((state) => state.load);
  const loadExampleWorkflows = useWorkflowStore((state) => state.loadExamples);
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const copyWorkflow = useWorkflowStore((state) => state.copy);
  const updateWorkflow = useWorkflowStore((state) => state.update);
  const queryClient = useQueryClient();
  const [workflowCategory, setWorkflowCategory] =
    useState<WorkflowCategory>("user");

  useEffect(() => {
    const categoryFromURL = searchParams.get(
      "category"
    ) as WorkflowCategory | null;
    if (
      categoryFromURL &&
      ["user", "examples", "public"].includes(categoryFromURL)
    ) {
      setWorkflowCategory(categoryFromURL);
    }
  }, [searchParams]);

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

  const { data, isLoading, error, isError } = useQuery<WorkflowList, Error>(
    ["workflows", workflowCategory],
    async () => {
      if (workflowCategory === "user") {
        return loadMyWorkflows("", 200);
      } else if (workflowCategory === "examples") {
        return loadExampleWorkflows();
      } else {
        throw new Error("Invalid workflow category");
      }
    }
  );

  const deleteWorkflow = useWorkflowStore().delete;
  const [workflowsToDelete, setWorkflowsToDelete] = useState<Workflow[]>([]);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);

  // OPEN WORKFLOW
  const onDoubleClickWorkflow = useCallback(
    (workflow: Workflow) => {
      if (workflowCategory === "examples") {
        // setShouldAutoLayout(true);
        copyWorkflow(workflow).then((workflow) => {
          navigate("/editor/" + workflow.id);
        });
      } else {
        setShouldAutoLayout(false);
        navigate("/editor/" + workflow.id);
      }
    },
    [navigate, setShouldAutoLayout, copyWorkflow, workflowCategory]
  );
  const onClickOpen = useCallback(
    (workflow: Workflow) => {
      if (controlKeyPressed || shiftKeyPressed) {
        return;
      }
      if (workflowCategory === "examples") {
        // setShouldAutoLayout(true);
        copyWorkflow(workflow).then((workflow) => {
          navigate("/editor/" + workflow.id);
        });
      } else {
        setShouldAutoLayout(false);
        navigate("/editor/" + workflow.id);
      }
    },
    [
      navigate,
      setShouldAutoLayout,
      copyWorkflow,
      workflowCategory,
      controlKeyPressed,
      shiftKeyPressed
    ]
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

  // WORKFLOW CATEGORY
  const handleWorfklowCategoryChange = (
    _event: React.MouseEvent<HTMLElement>,
    newCategory: string | null
  ) => {
    setWorkflowCategory((newCategory as WorkflowCategory) || "user");
  };

  // CREATE NEW WORKFLOW
  const handleCreateWorkflow = async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries(["workflows"]);
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

    setWorkflowCategory("user");
    await updateWorkflow(newWorkflow);
    queryClient.invalidateQueries(["workflows"]);
  };

  // DELETE WORKFLOW
  const onDelete = (e: any, workflow: Workflow) => {
    e.stopPropagation();
    setWorkflowsToDelete([workflow]);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(() => {
    workflowsToDelete.forEach((workflow) => {
      deleteWorkflow(workflow.id);
    });

    setIsDeleteDialogOpen(false);
    setWorkflowsToDelete([]);
    setSelectedWorkflows([]);
  }, [deleteWorkflow, workflowsToDelete]);

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

  // make names breakable
  function addBreaks(text: string) {
    return text.replace(/([-_.])/g, "$1<wbr>");
  }

  const handleSearchChange = (newSearchTerm: string) => {
    setFilterValue(newSearchTerm);
  };

  const handleSearchClear = () => {
    setFilterValue("");
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
        <div className="workflow-buttons">
          <Button variant="outlined" onClick={handleCreateWorkflow}>
            Create New
          </Button>
          <ToggleButtonGroup
            className="toggle-category"
            value={workflowCategory}
            onChange={handleWorfklowCategoryChange}
            exclusive
            aria-label="Workflow category"
          >
            <ToggleButton color="primary" value="user" aria-label="user">
              My Workflows
            </ToggleButton>
            <ToggleButton
              color="primary"
              value="examples"
              aria-label="examples"
            >
              Examples
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className="tools">
          <SearchInput
            onSearchChange={handleSearchChange}
            onSearchClear={handleSearchClear}
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
        {workflowCategory === "user" && (
          <div className="explanations">
            <Typography>
              Select multiple workflows for deletion by holding SHIFT or CONTROL
              keys.
            </Typography>
          </div>
        )}

        <div className="status">
          {isLoading && <CircularProgress />}
          {isError && (
            <div style={{ display: "flex", gap: "1em", alignItems: "center" }}>
              <ErrorOutlineRounded>
                <Typography>{error?.message}</Typography>
              </ErrorOutlineRounded>
              <Typography>No workflows found.</Typography>
            </div>
          )}
        </div>
        {settings.workflowLayout === "grid" ? (
          <RenderGridView
            workflows={filteredAndSortedWorkflows}
            onClickOpen={onClickOpen}
            onDoubleClickWorkflow={onDoubleClickWorkflow}
            onDuplicateWorkflow={duplicateWorkflow}
            onDelete={onDelete}
            onSelect={onSelect}
            selectedWorkflows={selectedWorkflows}
            workflowCategory={workflowCategory}
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
            workflowCategory={workflowCategory}
          />
        )}
      </div>
    </>
  );
};

export default WorkflowGrid;
