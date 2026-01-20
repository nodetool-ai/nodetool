/** @jsxImportSource @emotion/react */
import { FC, useCallback, memo, useState } from "react";
import { Button, Tooltip, Box, IconButton, Menu, MenuItem, Chip } from "@mui/material";
import SearchInput from "../search/SearchInput";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import SortIcon from "@mui/icons-material/Sort";
import ClearIcon from "@mui/icons-material/Clear";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import CheckIcon from "@mui/icons-material/Check";
import { TOOLTIP_ENTER_DELAY, TOOLTIP_ENTER_NEXT_DELAY } from "../../config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShowGraphPreview, useWorkflowListViewStore, useSortBy, useSelectedTags, SortBy } from "../../stores/WorkflowListViewStore";

interface WorkflowToolbarProps {
  setFilterValue: (value: string) => void;
  showCheckboxes: boolean;
  toggleCheckboxes: () => void;
  selectedWorkflowsCount: number;
  onBulkDelete: () => void;
  showFavoritesOnly?: boolean;
  onToggleFavorites?: () => void;
  availableTags?: string[];
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
      maxWidth: "230px",
      gap: "4px",
      alignItems: "center"
    },
    ".tools .tags-button": {
      fontSize: "0.7em",
      borderColor: `${"var(--palette-primary-main)"}33`,
      width: "2em",
      height: "2em",
      flexShrink: 0,
      marginLeft: "0.5em",
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
    ".tools .tags-button.has-selection": {
      borderColor: "var(--palette-primary-main)",
      "& svg": {
        color: "var(--palette-primary-main)"
      }
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
    },
    ".tools .active-tags-row": {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: "4px",
      alignItems: "center"
    },
    ".tools .active-tag-chip": {
      height: "20px",
      fontSize: theme.fontSizeSmaller,
      backgroundColor: "var(--palette-primary-main)",
      color: theme.vars.palette.primary.contrastText,
      border: "none",
      "& .MuiChip-deleteIcon": {
        color: theme.vars.palette.primary.contrastText,
        fontSize: "14px",
        "&:hover": {
          color: theme.vars.palette.grey[200]
        }
      }
    },
    ".tools .clear-tags-button": {
      height: "20px",
      fontSize: theme.fontSizeSmaller,
      padding: "0 6px",
      minWidth: "auto",
      color: theme.vars.palette.grey[400],
      "&:hover": {
        color: theme.vars.palette.grey[200]
      }
    },
    ".tag-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: "120px"
    },
    ".tag-menu-item .check-icon": {
      width: "16px",
      color: "var(--palette-primary-main)"
    },
    ".tag-menu-item .empty-icon": {
      width: "16px"
    }
  });

const WorkflowToolbar: FC<WorkflowToolbarProps> = ({
  setFilterValue,
  showCheckboxes,
  toggleCheckboxes,
  selectedWorkflowsCount,
  onBulkDelete,
  showFavoritesOnly = false,
  onToggleFavorites,
  availableTags = []
}) => {
  const theme = useTheme();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showGraphPreview = useShowGraphPreview();
  const setShowGraphPreview = useWorkflowListViewStore((state) => state.actions.setShowGraphPreview);
  const sortBy = useSortBy();
  const setSortBy = useWorkflowListViewStore((state) => state.actions.setSortBy);
  const selectedTags = useSelectedTags();
  const { toggleTag, clearSelectedTags } = useWorkflowListViewStore((state) => state.actions);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);
  const [tagsMenuAnchor, setTagsMenuAnchor] = useState<null | HTMLElement>(null);

  const handleToggleGraphPreview = useCallback(() => {
    setShowGraphPreview(!showGraphPreview);
  }, [setShowGraphPreview, showGraphPreview]);

  const handleSortMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setSortMenuAnchor(event.currentTarget);
  }, []);

  const handleSortMenuClose = useCallback(() => {
    setSortMenuAnchor(null);
  }, []);

  const handleTagsMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setTagsMenuAnchor(event.currentTarget);
  }, []);

  const handleTagsMenuClose = useCallback(() => {
    setTagsMenuAnchor(null);
  }, []);

  const handleSortChange = useCallback((newSortBy: SortBy) => {
    setSortBy(newSortBy);
    setSortMenuAnchor(null);
  }, [setSortBy]);

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
          {availableTags.length > 0 && (
            <>
              <Tooltip title="Filter by tags" enterDelay={TOOLTIP_ENTER_DELAY}>
                <IconButton
                  className={`tags-button ${selectedTags.length > 0 ? "has-selection" : ""}`}
                  onClick={handleTagsMenuOpen}
                >
                  <LocalOfferIcon />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={tagsMenuAnchor}
                open={Boolean(tagsMenuAnchor)}
                onClose={handleTagsMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "left",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "left",
                }}
              >
                {availableTags.map((tag) => (
                  <MenuItem
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="tag-menu-item"
                  >
                    {selectedTags.includes(tag) ? (
                      <CheckIcon className="check-icon" fontSize="small" />
                    ) : (
                      <span className="empty-icon" />
                    )}
                    {tag}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
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

          <Tooltip
            title={`Sort by ${sortBy === "date" ? "date" : "name"}`}
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              className="preview-toggle-button"
              onClick={handleSortMenuOpen}
            >
              <SortIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={sortMenuAnchor}
            open={Boolean(sortMenuAnchor)}
            onClose={handleSortMenuClose}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
          >
            <MenuItem
              onClick={() => handleSortChange("date")}
              selected={sortBy === "date"}
            >
              Sort by Date
            </MenuItem>
            <MenuItem
              onClick={() => handleSortChange("name")}
              selected={sortBy === "name"}
            >
              Sort by Name
            </MenuItem>
          </Menu>

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

        {selectedTags.length > 0 && (
          <div className="active-tags-row">
            {selectedTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                className="active-tag-chip"
                onDelete={() => toggleTag(tag)}
              />
            ))}
            {selectedTags.length > 1 && (
              <Tooltip title="Clear all tag filters" enterDelay={TOOLTIP_ENTER_DELAY}>
                <IconButton
                  className="clear-tags-button"
                  onClick={clearSelectedTags}
                  size="small"
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkflowToolbar);
