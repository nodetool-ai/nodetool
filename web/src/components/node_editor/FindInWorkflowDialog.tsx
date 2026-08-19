/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useMemo, useRef, useCallback } from "react";
import { useGlobalCombo } from "../../stores/KeyPressedStore";

import {
  Text,
  Caption,
  Box,
  ListGroup,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx,
  ListItem,
  ListItemButton
} from "../ui_primitives";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ClearIcon from "@mui/icons-material/Clear";
import { CloseButton } from "../ui_primitives";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";

const styles = (theme: Theme) =>
  css({
    "&.find-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "300px",
      maxHeight: "400px",
      zIndex: theme.zIndex.floatingPanel,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.xl,
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: `fadeIn ${MOTION.fast} forwards`,
      overflow: "hidden"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },
    "& .find-header": {
      display: "flex",
      alignItems: "center",
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .search-icon-wrapper": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary,
      marginRight: getSpacingPx(SPACING.lg)
    },
    "& .search-input-wrapper": {
      flex: 1,
      position: "relative"
    },
    "& .search-input": {
      width: "100%",
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
      fontSize: "var(--fontSizeNormal)",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.primary,
      outline: "none",
      "&:focus": {
        borderColor: theme.vars.palette.primary.main
      },
      "&::placeholder": {
        color: theme.vars.palette.text.disabled
      }
    },
    "& .clear-button": {
      position: "absolute",
      right: "8px",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.text.disabled,
      padding: getSpacingPx(SPACING.xs),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        color: theme.vars.palette.text.primary
      }
    },
    "& .results-count": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .results-list": {
      flex: 1,
      overflowY: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none"
    },
    "& .result-item": {
      padding: 0,
      margin: 0
    },
    "& .result-button": {
      display: "flex",
      alignItems: "center",
      padding: `${theme.spacing(3)} ${theme.spacing(4)}`,
      minHeight: "44px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`
      }
    },
    "& .result-name": {
      flex: 1,
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .result-type": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      marginLeft: getSpacingPx(SPACING.md),
      maxWidth: "100px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .navigation-buttons": {
      display: "flex",
      gap: getSpacingPx(SPACING.xs),
      marginLeft: getSpacingPx(SPACING.md)
    },
    "& .nav-button": {
      padding: getSpacingPx(SPACING.xs),
      minWidth: "28px",
      height: "28px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&:disabled": {
        opacity: 0.5,
        cursor: "not-allowed"
      }
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xxxl)} ${getSpacingPx(SPACING.xl)}`,
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "var(--fontSizeBig)",
      marginBottom: getSpacingPx(SPACING.md),
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "var(--fontSizeSmall)"
    }
  });

interface FindInWorkflowDialogProps {
  workflowId: string;
}

const FindInWorkflowDialog: React.FC<FindInWorkflowDialogProps> = memo(
  ({ workflowId: _workflowId }: FindInWorkflowDialogProps) => {
    const theme = useTheme();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const {
      isOpen,
      searchTerm,
      results,
      selectedIndex,
      closeFind,
      performSearch,
      goToSelected,
      navigateNext,
      navigatePrevious,
      clearSearch,
      selectNode,
      getNodeDisplayName
    } = useFindInWorkflow();

    useEffect(() => {
      if (isOpen) {
        const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(timeoutId);
      }
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          closeFind();
        }
      };

      let isMounted = true;

      // Delay adding the listener to avoid immediately closing on the same click that opened
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          document.addEventListener("mousedown", handleClickOutside);
        }
      }, 100);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen, closeFind]);

    // The find field holds focus while these fire, so every binding is
    // allowInInputs — the same "always on while the dialog is open" gate the
    // window listener had.
    const inInputs = { active: isOpen, allowInInputs: true } as const;
    useGlobalCombo("escape", closeFind, inInputs);
    useGlobalCombo("enter", navigateNext, inInputs);
    useGlobalCombo("enter+shift", navigatePrevious, inInputs);
    useGlobalCombo("arrowdown", navigateNext, inInputs);
    useGlobalCombo("arrowup", navigatePrevious, inInputs);
    // Swallow the browser's own Find while ours is open.
    useGlobalCombo("control+f", () => undefined, inInputs);
    useGlobalCombo("f+meta", () => undefined, inInputs);

    const handleInputChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        performSearch(event.target.value);
      },
      [performSearch]
    );

    const handleResultClick = useCallback(
      (event: React.MouseEvent<HTMLElement>) => {
        const index = Number(event.currentTarget.dataset.index);
        selectNode(index);
        goToSelected();
        closeFind();
      },
      [selectNode, goToSelected, closeFind]
    );

    const handleClear = useCallback(() => {
      clearSearch();
      inputRef.current?.focus();
    }, [clearSearch]);

    if (!isOpen) {
      return null;
    }

    const formatNodeType = (type: string): string => {
      const parts = type.split(".");
      if (parts.length > 1) {
        return parts.slice(0, -1).join(".");
      }
      return type;
    };

    return (
      <Box
        ref={containerRef}
        className="find-dialog-container"
        css={cssStyles}
      >
        <Box className="find-header">
          <Box className="search-icon-wrapper">
            <SearchIcon fontSize="small" />
          </Box>
          <Box className="search-input-wrapper">
            <input
              ref={inputRef}
              aria-label="Find nodes"
              className="search-input"
              type="text"
              placeholder="Find nodes..."
              value={searchTerm}
              onChange={handleInputChange}
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-button"
                aria-label="Clear search"
                onClick={handleClear}
              >
                <ClearIcon fontSize="small" />
              </button>
            )}
          </Box>
          <Box className="navigation-buttons">
            <button
              type="button"
              className="nav-button"
              onClick={navigatePrevious}
              disabled={results.length === 0}
              title="Previous (Shift+Enter)"
              aria-label="Previous match"
            >
              <ArrowUpwardIcon fontSize="small" />
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={navigateNext}
              disabled={results.length === 0}
              title="Next (Enter)"
              aria-label="Next match"
            >
              <ArrowDownwardIcon fontSize="small" />
            </button>
          </Box>
          <CloseButton
            onClick={closeFind}
            tooltip="Close (Escape)"
            buttonSize="small"
            nodrag={false}
            sx={{ marginLeft: getSpacingPx(SPACING.md) }}
          />
        </Box>

        <Box className="results-count">
          {results.length > 0 ? (
            <>
              {selectedIndex + 1} of {results.length} node
              {results.length !== 1 ? "s" : ""} found
            </>
          ) : searchTerm ? (
            <>No nodes found</>
          ) : (
            <>Type to search nodes</>
          )}
        </Box>

        {results.length > 0 ? (
          <ListGroup className="results-list" ref={listRef}>
            {results.map((result, index) => (
              <ListItem
                key={result.node.id}
                className="result-item"
                disablePadding
              >
                <ListItemButton
                  className={`result-button ${
                    index === selectedIndex ? "selected" : ""
                  }`}
                  data-index={index}
                  onClick={handleResultClick}
                >
                  <Text className="result-name" size="small">
                    {getNodeDisplayName(result.node)}
                  </Text>
                  <Caption className="result-type">
                    {formatNodeType(result.node.type ?? "")}
                  </Caption>
                </ListItemButton>
              </ListItem>
            ))}
          </ListGroup>
        ) : searchTerm ? (
          <Box className="empty-state">
            <SearchIcon className="empty-icon" />
            <Text className="empty-text">No matching nodes</Text>
          </Box>
        ) : null}
      </Box>
    );
  }
);

FindInWorkflowDialog.displayName = "FindInWorkflowDialog";

export default FindInWorkflowDialog;
