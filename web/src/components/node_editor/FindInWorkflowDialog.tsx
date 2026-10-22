/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  ListItemRow,
  Tooltip,
  EmptyState,
  SearchInput
} from "../ui_primitives";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { CloseButton, SHADOW } from "../ui_primitives";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";

const RESULT_BUTTON_SX = {
  px: 4,
  py: 3,
  minHeight: "44px",
  borderBottom: 1,
  borderColor: "divider"
} as const;

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
      boxShadow: SHADOW(theme).lg,
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
    "& .find-search": {
      flex: 1,
      position: "relative"
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
    "& .result-name": {
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
    "& .result-main": {
      flex: 1,
      minWidth: 0
    },
    "& .result-heading": {
      display: "flex",
      alignItems: "center"
    },
    "& .result-snippet": {
      display: "block",
      marginTop: getSpacingPx(SPACING.xs),
      color: theme.vars.palette.text.secondary,
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
    }
  });

interface FindInWorkflowDialogProps {
  workflowId: string;
}

const FindInWorkflowDialog: React.FC<FindInWorkflowDialogProps> = memo(
  ({ workflowId: _workflowId }: FindInWorkflowDialogProps) => {
    const { t } = useTranslation();
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
      activateResult,
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
    const activateSelectedAndClose = useCallback(() => {
      goToSelected();
      closeFind();
    }, [closeFind, goToSelected]);
    useGlobalCombo("enter", activateSelectedAndClose, inInputs);
    useGlobalCombo("enter+shift", navigatePrevious, inInputs);
    useGlobalCombo("arrowdown", navigateNext, inInputs);
    useGlobalCombo("arrowup", navigatePrevious, inInputs);
    // Swallow the browser's own Find while ours is open.
    useGlobalCombo("control+f", () => undefined, inInputs);
    useGlobalCombo("f+meta", () => undefined, inInputs);

    const handleResultClick = useCallback(
      (index: number) => {
        activateResult(index);
        closeFind();
      },
      [activateResult, closeFind]
    );

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
          <Box className="find-search">
            <SearchInput
              ref={inputRef}
              ariaLabel={t("findInWorkflow.search")}
              placeholder={t("findInWorkflow.search")}
              value={searchTerm}
              onChange={performSearch}
              onClear={clearSearch}
              escapeClears={false}
              fullWidth
            />
          </Box>
          <Box className="navigation-buttons">
            <Tooltip
              title={t("findInWorkflow.previousMatch")}
              shortcut={["Shift", "Enter"]}
              describeChild
              disabled={results.length === 0}
            >
              <button
                type="button"
                className="nav-button"
                onClick={navigatePrevious}
                disabled={results.length === 0}
                aria-label={t("findInWorkflow.previousMatch")}
              >
                <ArrowUpwardIcon fontSize="small" />
              </button>
            </Tooltip>
            <Tooltip
              title={t("findInWorkflow.nextMatch")}
              shortcut={["Enter"]}
              describeChild
              disabled={results.length === 0}
            >
              <button
                type="button"
                className="nav-button"
                onClick={navigateNext}
                disabled={results.length === 0}
                aria-label={t("findInWorkflow.nextMatch")}
              >
                <ArrowDownwardIcon fontSize="small" />
              </button>
            </Tooltip>
          </Box>
          <CloseButton
            onClick={closeFind}
            shortcut={["Esc"]}
            buttonSize="small"
            nodrag={false}
            sx={{ marginLeft: getSpacingPx(SPACING.md) }}
          />
        </Box>

        <Box className="results-count">
          {results.length > 0 ? (
            <>
              {t("findInWorkflow.resultsCount", { current: selectedIndex + 1, count: results.length })}
            </>
          ) : searchTerm ? (
            <>{t("findInWorkflow.noNodesFound")}</>
          ) : (
            <>{t("findInWorkflow.typeToSearch")}</>
          )}
        </Box>

        {results.length > 0 ? (
          <ListGroup className="results-list" ref={listRef}>
            {results.map((result, index) => (
              <ListItemRow
                key={result.node.id}
                className="result-item"
                disablePadding
                selected={index === selectedIndex}
                onClick={() => handleResultClick(index)}
                buttonSx={RESULT_BUTTON_SX}
              >
                <Box className="result-main">
                  <Box className="result-heading">
                    <Text className="result-name" size="small">
                      {getNodeDisplayName(result.node)}
                    </Text>
                    <Caption className="result-type">
                      {formatNodeType(result.node.type ?? "")}
                    </Caption>
                  </Box>
                  {result.matchedField ? (
                    <Caption className="result-snippet">
                      {result.matchedField}: {result.matchSnippet}
                    </Caption>
                  ) : null}
                </Box>
              </ListItemRow>
            ))}
          </ListGroup>
        ) : searchTerm ? (
          <EmptyState
            size="small"
            variant="no-results"
            icon={<SearchIcon />}
            title={t("findInWorkflow.noMatchingNodes")}
          />
        ) : null}
      </Box>
    );
  }
);

FindInWorkflowDialog.displayName = "FindInWorkflowDialog";

export default FindInWorkflowDialog;
