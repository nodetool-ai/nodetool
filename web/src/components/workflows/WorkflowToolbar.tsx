/** @jsxImportSource @emotion/react */
import { FC, useCallback, memo } from "react";
import { Button, Tooltip, Box, IconButton } from "@mui/material";
import SearchInput from "../search/SearchInput";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { TOOLTIP_ENTER_DELAY, TOOLTIP_ENTER_NEXT_DELAY } from "../../config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShowGraphPreview, useWorkflowListViewStore } from "../../stores/WorkflowListViewStore";

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
      width: "calc(100% - 10px)",
    ".tools": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      margin: "0 10px"
    },
    ".tools .search-row": {
      display: "flex",
      width: "100%",
      maxWidth: "200px"
    },
    ".tools .buttons-row": {
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      alignItems: "center",
      width: "100%"
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
    ".tools .preview-toggle-button": {
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
    ".tools .preview-toggle-button.active": {
      borderColor: "var(--palette-primary-main)",
      "& svg": {
        color: "var(--palette-primary-main)"
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
      backgroundColor: theme.vars.palette.primary.main,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        color: theme.vars.palette.primary.light,
        // borderColor: theme.vars.palette.primary.light,
        backgroundColor: theme.vars.palette.primary.dark
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
  const showGraphPreview = useShowGraphPreview();
  const setShowGraphPreview = useWorkflowListViewStore((state) => state.actions.setShowGraphPreview);

  const handleToggleGraphPreview = useCallback(() => {
    setShowGraphPreview(!showGraphPreview);
  }, [setShowGraphPreview, showGraphPreview]);

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
        <div className="search-row">
          <Tooltip title="Search workflows by name" enterDelay={TOOLTIP_ENTER_DELAY}>
            <div style={{ flex: 1 }}>
              <SearchInput
                onSearchChange={handleSearchChange}
                focusSearchInput={false}
                width="100%"
              />
            </div>
          </Tooltip>
        </div>

        <div className="buttons-row">
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

          <Tooltip
            title={`${showGraphPreview ? "Hide" : "Show"} graph preview`}
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              className={`preview-toggle-button ${showGraphPreview ? "active" : ""}`}
              onClick={handleToggleGraphPreview}
            >
              {showGraphPreview ? <ViewModuleIcon /> : <ViewListIcon />}
            </IconButton>
          </Tooltip>

          <div style={{ flexGrow: 1 }} />

          <Tooltip
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement="top"
            title="Create new workflow"
          >
            <IconButton
              className="add-button"
              onClick={handleCreateWorkflow}
              size="large"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </Box>
  );
};

export default memo(WorkflowToolbar);
