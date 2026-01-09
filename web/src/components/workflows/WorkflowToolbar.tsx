/** @jsxImportSource @emotion/react */
import { FC, useCallback } from "react";
import { Button, Tooltip, Box, IconButton } from "@mui/material";
import SearchInput from "../search/SearchInput";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface WorkflowToolbarProps {
  setFilterValue: (value: string) => void;
  showCheckboxes: boolean;
  toggleCheckboxes: () => void;
  selectedWorkflowsCount: number;
  onBulkDelete: () => void;
  showFavoritesOnly?: boolean;
  onToggleFavorites?: () => void;
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
    ".tools .checkbox-button": {
      fontSize: "0.7em",
      borderColor: `${"var(--palette-primary-main)"}33`,
      width: "2em",
      height: "2em",
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
    ".tools .favorite-button": {
      fontSize: "0.7em",
      borderColor: `${"var(--palette-primary-main)"}33`,
      width: "2em",
      height: "2em",
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
    ".tools .favorite-button.active": {
      borderColor: "warning.main",
      "& svg": {
        color: "warning.main",
        fill: "warning.main"
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
    },
    ".spacer": {
      flexGrow: 1
    },
    ".add-button": {
      width: "28px",
      height: "28px",
      minWidth: "28px",
      borderRadius: "6px",
      color: theme.vars.palette.grey[400],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      "&:hover": {
        color: theme.vars.palette.grey[100],
        borderColor: theme.vars.palette.grey[500],
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    }
  });

const WorkflowToolbar: FC<WorkflowToolbarProps> = ({
  setFilterValue,
  showCheckboxes,
  toggleCheckboxes,
  selectedWorkflowsCount,
  onBulkDelete,
  showFavoritesOnly = false,
  onToggleFavorites
}) => {
  const theme = useTheme();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        <Tooltip title="Search workflows by name" enterDelay={TOOLTIP_ENTER_DELAY}>
          <div>
            <SearchInput
              onSearchChange={handleSearchChange}
              focusSearchInput={false}
              width="100%"
            />
          </div>
        </Tooltip>

        {selectedWorkflowsCount > 0 && (
          <Tooltip
            title={`Delete ${selectedWorkflowsCount} selected workflow${selectedWorkflowsCount > 1 ? "s" : ""
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

        <Tooltip
          title={`${showCheckboxes ? "Hide" : "Show"} selection checkboxes`}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton className="checkbox-button" onClick={toggleCheckboxes}>
            <CheckBoxIcon />
          </IconButton>
        </Tooltip>

        {onToggleFavorites && (
          <Tooltip
            title={`${showFavoritesOnly ? "Show all workflows" : "Show favorites only"}`}
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              className={`favorite-button ${showFavoritesOnly ? "active" : ""}`}
              onClick={onToggleFavorites}
            >
              {showFavoritesOnly ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Create new workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="add-button"
            onClick={handleCreateWorkflow}
            size="large"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
    </Box>
  );
};

export default WorkflowToolbar;
