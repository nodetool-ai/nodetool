/** @jsxImportSource @emotion/react */
import { FC, useCallback, useMemo } from "react";
import { Button, Tooltip, Select, MenuItem, Box } from "@mui/material";
import SearchInput from "../search/SearchInput";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import StarIcon from "@mui/icons-material/Star";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import DeleteIcon from "@mui/icons-material/Delete";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import useFavoritesStore from "../../stores/FavoritesStore";

interface WorkflowToolbarProps {
  workflows: Workflow[];
  setFilterValue: (value: string) => void;
  selectedTag: string;
  setSelectedTag: (tag: string) => void;
  showFavorites: boolean;
  setShowFavorites: (show: boolean) => void;
  showCheckboxes: boolean;
  toggleCheckboxes: () => void;
  selectedWorkflowsCount: number;
  onBulkDelete: () => void;
}

const styles = (theme: Theme) =>
  css({
    ".tools": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "center",
      margin: "0 10px"
    },
    ".tools .icon-button": {
      fontSize: "0.7em",
      borderColor: `${"var(--palette-primary-main)"}33`,
      width: "3em",
      height: "3em",
      "&:hover": {
        borderColor: "var(--palette-primary-main)"
      },
      "& svg": {
        color: theme.vars.palette.grey[400]
      },
      "&:hover svg": {
        fill: "var(--palette-primary-main)"
      }
    },
    ".tools .delete-selected-button": {
      borderColor: `${"var(--palette-primary-main)"}33`,
      color: "var(--palette-primary-main)",
      "&:hover": {
        borderColor: "var(--palette-primary-main)"
      },
      "& svg": {
        color: "var(--palette-primary-main)"
      }
    },
    ".MuiOutlinedInput-root": {
      fontSize: "20px"
    },
    ".filter": {
      width: "130px",
      height: "35px",
      fontSize: "var(--fontSizeSmall)"
    }
  });

const WorkflowToolbar: FC<WorkflowToolbarProps> = ({
  workflows,
  selectedTag,
  setSelectedTag,
  setFilterValue,
  showFavorites,
  setShowFavorites,
  showCheckboxes,
  toggleCheckboxes,
  selectedWorkflowsCount,
  onBulkDelete
}) => {
  const theme = useTheme();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const favoriteWorkflowIds = useFavoritesStore((state) => state.favoriteWorkflowIds);
  
  const uniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    workflows.forEach((wf) =>
      wf.tags?.forEach((tag: string) => tagSet.add(tag))
    );
    return Array.from(tagSet);
  }, [workflows]);

  const favoriteCount = useMemo(() => {
    return workflows.filter((wf) => favoriteWorkflowIds.includes(wf.id)).length;
  }, [workflows, favoriteWorkflowIds]);

  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow, queryClient]);

  const handleSearchChange = useCallback(
    (newSearchTerm: string) => {
      setFilterValue(newSearchTerm);
    },
    [setFilterValue]
  );

  return (
    <Box css={styles(theme)}>
      <div className="tools">
        <Tooltip
          title={`${showCheckboxes ? "Hide" : "Show"} selection checkboxes`}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button className="icon-button" onClick={toggleCheckboxes}>
            <CheckBoxIcon />
          </Button>
        </Tooltip>
        {/* New Workflow button moved to WorkflowList header */}

        <Tooltip title="Search workflows by name" enterDelay={TOOLTIP_ENTER_DELAY}>
          <div>
            <SearchInput
              onSearchChange={handleSearchChange}
              focusSearchInput={false}
            />
          </div>
        </Tooltip>

        <Tooltip
          title={`${showFavorites ? "Hide" : "Show"} only favorite workflows`}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button
            className={`icon-button ${showFavorites ? "favorite-active" : ""}`}
            onClick={() => setShowFavorites(!showFavorites)}
            sx={{
              color: showFavorites ? "#ffd700" : undefined,
              "&:hover": {
                color: showFavorites ? "#ffd700" : undefined
              }
            }}
          >
            <StarIcon />
            {favoriteCount > 0 && (
              <span style={{ fontSize: "0.6em", marginLeft: "4px" }}>
                {favoriteCount}
              </span>
            )}
          </Button>
        </Tooltip>

        <Tooltip title="Filter workflows by tag" enterDelay={TOOLTIP_ENTER_DELAY}>
          <Select
            sx={{
              padding: "0 0.5em"
            }}
            variant="standard"
            label="Filter by tag"
            className="filter"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {uniqueTags.map((tag) => (
              <MenuItem key={tag} value={tag}>
                {tag}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>

        {selectedWorkflowsCount > 0 && (
          <Tooltip
            title={`Delete ${selectedWorkflowsCount} selected workflow${
              selectedWorkflowsCount > 1 ? "s" : ""
            }`}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              variant="outlined"
              className="delete-selected-button"
              onClick={onBulkDelete}
            >
              <DeleteIcon />
            </Button>
          </Tooltip>
        )}
      </div>
    </Box>
  );
};

export default WorkflowToolbar;
