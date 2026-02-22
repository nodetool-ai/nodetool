/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";

const styles = (theme: Theme) =>
  css({
    "&.search-result-actions": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      marginLeft: "8px"
    },
    "& .action-icon": {
      padding: "4px",
      fontSize: "16px",
      color: theme.vars.palette.text.secondary,
      transition: "color 150ms ease",
      "&:hover": {
        color: theme.vars.palette.text.primary
      },
      "&.selected": {
        color: theme.vars.palette.primary.main
      }
    },
    "& .bypassed-icon": {
      color: theme.vars.palette.text.disabled
    }
  });

interface SearchResultActionsProps {
  /** Whether the node is currently selected */
  isSelected: boolean;
  /** Whether the node is currently bypassed */
  isBypassed: boolean;
  /** Callback to select the node */
  onSelect: () => void;
  /** Callback to toggle bypass state */
  onToggleBypass: () => void;
  /** Callback to focus/zoom to the node */
  onFocus: () => void;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Quick action buttons for search results in the Find in Workflow dialog.
 *
 * Provides single-click access to common node operations:
 * - Select node in the workflow
 * - Toggle bypass state
 * - Focus/zoom to node in the canvas
 *
 * @example
 * ```tsx
 * <SearchResultActions
 *   isSelected={node.selected}
 *   isBypassed={node.data.bypassed}
 *   onSelect={() => handleSelectNode(node.id)}
 *   onToggleBypass={() => handleToggleBypass(node.id)}
 *   onFocus={() => handleFocusNode(node.id)}
 * />
 * ```
 */
const SearchResultActions: React.FC<SearchResultActionsProps> = memo(
  ({
    isSelected,
    isBypassed,
    onSelect,
    onToggleBypass,
    onFocus,
    className = ""
  }: SearchResultActionsProps) => {
    const theme = useTheme();

    const handleSelectClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onSelect();
      },
      [onSelect]
    );

    const handleBypassClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onToggleBypass();
      },
      [onToggleBypass]
    );

    const handleFocusClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onFocus();
      },
      [onFocus]
    );

    return (
      <Box
        className={`search-result-actions ${className}`}
        css={styles(theme)}
      >
        <Tooltip title="Select node" arrow>
          <IconButton
            className={`action-icon ${isSelected ? "selected" : ""}`}
            onClick={handleSelectClick}
            size="small"
            aria-label="Select node"
          >
            {isSelected ? (
              <CheckCircleIcon fontSize="small" />
            ) : (
              <RadioButtonUncheckedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title={isBypassed ? "Enable node" : "Bypass node"} arrow>
          <IconButton
            className={`action-icon ${isBypassed ? "bypassed-icon" : ""}`}
            onClick={handleBypassClick}
            size="small"
            aria-label={isBypassed ? "Enable node" : "Bypass node"}
          >
            {isBypassed ? (
              <VisibilityOffIcon fontSize="small" />
            ) : (
              <VisibilityIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Focus on node" arrow>
          <IconButton
            className="action-icon"
            onClick={handleFocusClick}
            size="small"
            aria-label="Focus on node"
          >
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }
);

SearchResultActions.displayName = "SearchResultActions";

export default SearchResultActions;
