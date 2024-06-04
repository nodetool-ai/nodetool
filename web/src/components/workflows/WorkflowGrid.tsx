/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { prettyDate } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import SearchInput from "../search/SearchInput";
import DeleteButton from "../buttons/DeleteButton";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { useSearchParams } from "react-router-dom";

import {
  Typography,
  Box,
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

const tile_width = "200px";
const tile_height = "200px";

type WorkflowCategory = "user" | "examples";

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
    }
  });

const gridStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexWrap: "wrap",
      margin: ".5em 1em",
      maxHeight: "calc(100vh - 250px)",
      overflowY: "auto"
    },
    ".workflow": {
      boxSizing: "border-box",
      position: "relative",
      flex: `1 0 ${tile_width}`,
      margin: "1em .5em 1em .5em",
      borderBottom: "1px solid gray",
      paddingBottom: ".25em",
      maxWidth: tile_width,
      cursor: "pointer"
    },
    ".image-wrapper": {
      flexShrink: 0,
      width: tile_width,
      height: tile_height,
      overflow: "hidden",
      position: "relative"
    },
    ".name": {
      top: "-5px",
      left: "5px",
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0 .25em",
      lineHeight: "1em",
      color: theme.palette.c_hl1
    },
    ".description": {
      margin: "0.25em 0 .75em"
    },
    ".date": {},
    ".right": {
      marginTop: "auto"
    },
    ".right button": {
      position: "absolute",
      bottom: "-5px",
      right: "-5px"
    }
  });
const listStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      margin: ".5em 1em 0 1.5em",
      maxHeight: "calc(100vh - 280px)",
      overflow: "hidden auto"
    },
    ".workflow": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "flex-start",
      margin: ".25em 0",
      padding: "0.4em 0",
      width: "calc(100% - 100px)",
      cursor: "pointer",
      borderBottom: "1px solid black",
      transition: "background 0.2s"
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.c_gray1,
      outline: `0`
    },
    ".name-and-description": {
      display: "flex",
      flexDirection: "column",
      gap: "0.1em"
    },
    ".name": {
      fontSize: theme.fontSizeNormal,
      margin: "0",
      lineHeight: "1em",
      color: theme.palette.c_hl1
    },
    ".description": {
      margin: "0.1em 0 .1em"
    },
    ".date": {
      marginLeft: "auto",
      paddingRight: "1em",
      fontFamily: theme.fontFamily2,
      right: "0",
      minWidth: "150px"
    },
    ".image-wrapper": {
      flexShrink: 0,
      width: "40px",
      height: "40px",
      overflow: "hidden",
      position: "relative"
    },
    ".right": {
      display: "flex",
      alignItems: "center",
      minWidth: "200px",
      marginLeft: "auto"
    }
  });

const WorkflowGrid = () => {
  const [filterValue, setFilterValue] = useState("");
  const { settings, setWorkflowLayout, setWorkflowOrder } = useSettingsStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const loadMyWorkflows = useWorkflowStore((state) => state.load);
  const loadExampleWorkflows = useWorkflowStore((state) => state.loadExamples);
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const copyWorkflow = useWorkflowStore((state) => state.copy);
  const queryClient = useQueryClient();
  const [workflowCategory, setWorkflowCategory] =
    useState<WorkflowCategory>("user"); // Default value

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
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(
    null
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);

  const onClickWorkflow = useCallback(
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

  // DELETE WORKFLOW
  const onDelete = (e: any, workflow: Workflow) => {
    e.stopPropagation();
    setWorkflowToDelete(workflow);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(() => {
    if (!workflowToDelete) return;

    deleteWorkflow(workflowToDelete.id);
    setIsDeleteDialogOpen(false);
    setWorkflowToDelete(null);
  }, [deleteWorkflow, workflowToDelete]);

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
  // Grid view
  const renderGridView = (workflows: any) => (
    <Box className="container grid" css={gridStyles}>
      {workflows.map((workflow: Workflow) => (
        <Box
          key={workflow.id}
          className="workflow grid"
          onClick={() => onClickWorkflow(workflow)}
          sx={{ display: "flex", flexDirection: "column" }}
        >
          <Box
            className="image-wrapper"
            sx={{
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundImage: workflow.thumbnail_url
                ? `url(${workflow.thumbnail_url})`
                : "none",
              width: "200px",
              height: "200px"
            }}
          >
            {!workflow.thumbnail_url && <Box className="image-placeholder" />}
          </Box>
          <div
            className="name"
            dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
          ></div>
          <Typography className="description">
            {truncateString(workflow.description, 150)}
          </Typography>
          <div className="right">
            <Typography className="date">
              {prettyDate(workflow.updated_at, "verbose", settings)}
            </Typography>
            <DeleteButton<Workflow> item={workflow} onClick={onDelete} />
          </div>
        </Box>
      ))}
    </Box>
  );

  // List view
  const renderListView = (workflows: any) => (
    <Box className="container list" css={listStyles}>
      {workflows.map((workflow: Workflow) => (
        <Box
          key={workflow.id}
          className="workflow list"
          onClick={() => onClickWorkflow(workflow)}
        >
          <Box
            className="image-wrapper"
            sx={{
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundImage: workflow.thumbnail_url
                ? `url(${workflow.thumbnail_url})`
                : "none",
              width: "50px",
              height: "50px"
            }}
          >
            {!workflow.thumbnail_url && <Box className="image-placeholder" />}
          </Box>
          <Box className="name-and-description">
            <div
              className="name"
              dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
            ></div>
            <Typography className="description">
              {truncateString(workflow.description, 350)}
            </Typography>
          </Box>
          <div className="right">
            <Typography className="date">
              {prettyDate(workflow.updated_at, "verbose", settings)}
            </Typography>
            <DeleteButton<Workflow>
              className="delete-button"
              item={workflow}
              onClick={onDelete}
            />
          </div>
        </Box>
      ))}
    </Box>
  );

  return (
    <div css={styles}>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        confirmText="Delete"
        cancelText="Cancel"
        title="Delete Workflow"
        notificationMessage={`Workflow '${workflowToDelete?.name}' deleted`}
        notificationType="success"
        content={`Delete workflow '${workflowToDelete?.name}'?`}
      />

      <div className="workflow-buttons">
        <Button variant="outlined" onClick={handleCreateWorkflow}>
          Create New
        </Button>
        {/* <Button color="primary" onClick={handleWorfklowCategoryChange}>
          All Workflows
        </Button>
        <Button color="primary" onClick={handleWorfklowCategoryChange}>
          Example Workflows
        </Button> */}
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
          <ToggleButton color="primary" value="examples" aria-label="examples">
            Examples
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      {/* <Button
        onClick={() => {
          handleCreateWorkflow();
        }}
        variant="outlined"
        sx={{ flexGrow: 1, margin: "2em 0 0 2em" }}
      >
        Create Workflow
      </Button> */}
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
      </div>
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
      {settings.workflowLayout === "grid"
        ? renderGridView(filteredAndSortedWorkflows)
        : renderListView(filteredAndSortedWorkflows)}
    </div>
  );
};

export default WorkflowGrid;
