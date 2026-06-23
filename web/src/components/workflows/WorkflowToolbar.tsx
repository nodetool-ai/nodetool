/** @jsxImportSource @emotion/react */
import { FC, useCallback, memo, useState, useMemo } from "react";
import { ToolbarIconButton, DeleteButton, Chip, Box, EditorMenu, EditorMenuItem, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import SortIcon from "@mui/icons-material/Sort";
import ClearIcon from "@mui/icons-material/Clear";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import CheckIcon from "@mui/icons-material/Check";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShowGraphPreview, useWorkflowListViewStore, useSortBy, useSelectedTags, SortBy } from "../../stores/WorkflowListViewStore";

interface WorkflowToolbarProps {
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
    width: "100%",

    ".tools": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.md),
      padding: `0 ${getSpacingPx(SPACING.lg)}` // was 0 10px
    },

    ".tools .buttons-row": {
      display: "flex",
      flexDirection: "row",
      gap: getSpacingPx(SPACING.micro),
      alignItems: "center",
      width: "100%"
    },

    ".tools .tool-button": {
      width: "28px",
      height: "28px",
      minWidth: "28px",
      padding: 0,
      borderRadius: BORDER_RADIUS.xs,
      border: "none",
      backgroundColor: "transparent",
      transition: MOTION.all,

      "& svg": {
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.secondary,
        transition: `color ${MOTION.fast}`
      },

      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        "& svg": {
          color: theme.vars.palette.text.primary
        }
      },

      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        "& svg": {
          color: theme.vars.palette.text.primary
        }
      },

      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "-2px"
      }
    },

    ".tools .tool-button.favorite-active": {
      backgroundColor: theme.vars.palette.action.selected,
      "& svg": {
        color: theme.vars.palette.warning.main
      }
    },

    ".tools .delete-selected-button": {
      width: "28px",
      height: "28px",
      minWidth: "28px",
      padding: 0,
      borderRadius: BORDER_RADIUS.xs,
      border: "none",
      backgroundColor: "transparent",
      color: theme.vars.palette.error.main,
      transition: MOTION.all,
      "& svg": {
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.error.main
      },
      "&:hover": {
        backgroundColor: `${theme.vars.palette.error.main}1F`
      }
    },

    ".tools .active-tags-row": {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.xs),
      alignItems: "center"
    },

    ".tools .active-tag-chip": {
      height: "20px",
      fontSize: "var(--fontSizeSmaller)",
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.primary,
      border: "none",
      "& .MuiChip-deleteIcon": {
        color: theme.vars.palette.text.secondary,
        fontSize: "var(--fontSizeSmall)",
        "&:hover": {
          color: theme.vars.palette.text.primary
        }
      }
    },

    ".tools .clear-tags-button": {
      height: "20px",
      fontSize: "var(--fontSizeSmaller)",
      padding: `0 ${getSpacingPx(SPACING.sm)}`,
      minWidth: "auto",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary
      }
    },

    ".tag-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      minWidth: "120px"
    },
    ".tag-menu-item .check-icon": {
      width: "16px",
      color: theme.vars.palette.primary.main
    },
    ".tag-menu-item .empty-icon": {
      width: "16px"
    }
  });

const WorkflowToolbar: FC<WorkflowToolbarProps> = ({
  showCheckboxes,
  toggleCheckboxes,
  selectedWorkflowsCount,
  onBulkDelete,
  showFavoritesOnly = false,
  onToggleFavorites,
  availableTags = []
}) => {
  const theme = useTheme();
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

  const handleSortByDate = useCallback(() => {
    handleSortChange("date");
  }, [handleSortChange]);

  const handleSortByName = useCallback(() => {
    handleSortChange("name");
  }, [handleSortChange]);

  // Memoize tag handlers to prevent new function references in map()
  // This is a performance optimization: prevents MenuItem and Chip from re-rendering
  // when the parent component re-renders
  const tagHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const tag of availableTags) {
      handlers[tag] = () => toggleTag(tag);
    }
    return handlers;
  }, [availableTags, toggleTag]);

  // Memoize selected tags set for O(1) lookup
  const selectedTagsSet = useMemo(() => new Set(selectedTags), [selectedTags]);

  return (
    <Box css={styles(theme)}>
      <div className="tools">
        <div className="buttons-row">
          {availableTags.length > 0 && (
            <>
              <ToolbarIconButton
                icon={<LocalOfferIcon />}
                tooltip="Filter by tags"
                onClick={handleTagsMenuOpen}
                active={selectedTags.length > 0}
                className={`tool-button ${selectedTags.length > 0 ? "active" : ""}`}
                nodrag={false}
              />
              <EditorMenu
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
                  <EditorMenuItem
                    key={tag}
                    onClick={tagHandlers[tag]}
                    className="tag-menu-item"
                  >
                    {selectedTagsSet.has(tag) ? (
                      <CheckIcon className="check-icon" fontSize="small" />
                    ) : (
                      <span className="empty-icon" />
                    )}
                    {tag}
                  </EditorMenuItem>
                ))}
              </EditorMenu>
            </>
          )}
          {selectedWorkflowsCount > 0 && (
            <DeleteButton
              tooltip={`Delete ${selectedWorkflowsCount} selected workflow${selectedWorkflowsCount > 1 ? "s" : ""}`}
              onClick={onBulkDelete}
              className="delete-selected-button"
            />
          )}

          <ToolbarIconButton
            icon={<CheckBoxIcon />}
            tooltip={`${showCheckboxes ? "Hide" : "Show"} selection checkboxes`}
            onClick={toggleCheckboxes}
            tooltipPlacement="top"
            active={showCheckboxes}
            className={`tool-button ${showCheckboxes ? "active" : ""}`}
            nodrag={false}
          />

          {onToggleFavorites && (
            <ToolbarIconButton
              icon={showFavoritesOnly ? <StarIcon /> : <StarBorderIcon />}
              tooltip={`${showFavoritesOnly ? "Show all workflows" : "Show favorites only"}`}
              onClick={onToggleFavorites}
              tooltipPlacement="top"
              active={showFavoritesOnly}
              className={`tool-button ${showFavoritesOnly ? "favorite-active" : ""}`}
              nodrag={false}
            />
          )}

          <ToolbarIconButton
            icon={showGraphPreview ? <ViewModuleIcon /> : <ViewListIcon />}
            tooltip={`${showGraphPreview ? "Hide" : "Show"} graph preview`}
            onClick={handleToggleGraphPreview}
            tooltipPlacement="top"
            active={showGraphPreview}
            className={`tool-button ${showGraphPreview ? "active" : ""}`}
            nodrag={false}
          />

          <ToolbarIconButton
            icon={<SortIcon />}
            tooltip={`Sort by ${sortBy === "date" ? "date" : "name"}`}
            onClick={handleSortMenuOpen}
            tooltipPlacement="top"
            className="tool-button"
            nodrag={false}
          />
          <EditorMenu
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
            <EditorMenuItem
              onClick={handleSortByDate}
              selected={sortBy === "date"}
            >
              Sort by Date
            </EditorMenuItem>
            <EditorMenuItem
              onClick={handleSortByName}
              selected={sortBy === "name"}
            >
              Sort by Name
            </EditorMenuItem>
          </EditorMenu>

        </div>

        {selectedTags.length > 0 && (
          <div className="active-tags-row">
            {selectedTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                className="active-tag-chip"
                onDelete={tagHandlers[tag]}
              />
            ))}
            {selectedTags.length > 1 && (
              <ToolbarIconButton
                icon={<ClearIcon fontSize="small" />}
                tooltip="Clear all tag filters"
                onClick={clearSelectedTags}
                size="small"
                className="clear-tags-button"
                nodrag={false}
              />
            )}
          </div>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkflowToolbar);
