/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useLayoutEffect
} from "react";
import {
  Button,
  Typography,
  Box,
  Tooltip,
  CircularProgress,
  Chip,
  Checkbox,
  Popover,
  PopoverOrigin
} from "@mui/material";
import isEqual from "lodash/isEqual";
import { AccountTree } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useWorkflowTools } from "../../../serverState/useWorkflowTools";
import { useTheme } from "@mui/material/styles";
import SearchInput from "../../search/SearchInput";

// Popover dimensions
const POPOVER_WIDTH = 360;
const POPOVER_HEIGHT = 420;

const toolsSelectorStyles = (theme: Theme) =>
  css({
    ".items-container": {
      flex: 1,
      overflow: "auto",
      padding: "0 8px"
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing(4),
      flex: 1
    },
    ".workflow-tool-item": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      padding: theme.spacing(0.75, 1),
      borderRadius: 6,
      cursor: "pointer",
      borderLeft: "3px solid transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`
      }
    },
    ".workflow-name": {
      color: theme.vars.palette.text.primary,
      fontSize: "0.8rem",
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workflow-description": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.7rem",
      marginTop: "2px",
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".no-tools-message": {
      padding: theme.spacing(4),
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });

interface WorkflowToolsSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

const WorkflowToolsSelector: React.FC<WorkflowToolsSelectorProps> = ({
  value,
  onChange
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selectedTools = useMemo(
    () => value.filter((tool) => tool.startsWith("workflow_")) || [],
    [value]
  );
  const theme = useTheme();
  // Get workflow tools via React Query hook
  const {
    workflowTools,
    workflowToolsLoading: isLoading,
    workflowToolsError
  } = useWorkflowTools();
  const isError = Boolean(workflowToolsError);
  const [searchTerm, setSearchTerm] = useState("");
  const [hoveredToolName, setHoveredToolName] = useState<string | null>(null);

  const filteredSortedTools = useMemo(() => {
    if (!workflowTools) { return [] as typeof workflowTools; }
    const q = searchTerm.trim().toLowerCase();
    const filtered = q
      ? workflowTools.filter((w) => {
        const name = (w.name ?? "").toLowerCase();
        const desc = (w.description ?? "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      : workflowTools;
    return [...filtered].sort((a, b) => {
      const aSelected = selectedTools.includes(`workflow_${a.tool_name}`);
      const bSelected = selectedTools.includes(`workflow_${b.tool_name}`);
      if (aSelected !== bSelected) { return aSelected ? -1 : 1; }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [workflowTools, searchTerm, selectedTools]);

  const handleClick = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
    setSearchTerm("");
  }, []);

  const handleToggleTool = useCallback(
    (toolId: string) => {
      const newTools = selectedTools.includes(toolId)
        ? selectedTools.filter((id) => id !== toolId)
        : [...selectedTools, toolId];
      onChange(newTools);
    },
    [selectedTools, onChange]
  );

  const _handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  // Positioning logic for Popover
  const [positionConfig, setPositionConfig] = useState<{
    anchorOrigin: PopoverOrigin;
    transformOrigin: PopoverOrigin;
  }>({
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" }
  });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT) {
      setPositionConfig({
        anchorOrigin: { vertical: "top", horizontal: "left" },
        transformOrigin: { vertical: "bottom", horizontal: "left" }
      });
    } else {
      setPositionConfig({
        anchorOrigin: { vertical: "bottom", horizontal: "left" },
        transformOrigin: { vertical: "top", horizontal: "left" }
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (isMenuOpen) {
      updatePosition();
      setSearchTerm("");
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
  }, [isMenuOpen, updatePosition]);

  return (
    <>
      <Tooltip
        title={
          selectedTools.length > 0
            ? `${selectedTools.length} workflow tools selected`
            : "Select Workflow Tools"
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`workflow-tools-button ${selectedTools.length > 0 ? "active" : ""
            }`}
          onClick={handleClick}
          size="small"
          startIcon={<AccountTree fontSize="small" />}
          endIcon={
            selectedTools.length > 0 && (
              <Chip
                size="small"
                label={selectedTools.length}
                className="selected-count"
              />
            )
          }
          sx={(theme) => ({
            color: theme.vars.palette.grey[0],
            padding: "0.25em 0.75em",
            "&:hover": {
              backgroundColor: theme.vars.palette.grey[500]
            },
            "&.active": {
              borderColor: "var(--palette-primary-main)",
              color: "var(--palette-primary-main)",
              "& .MuiSvgIcon-root": {
                color: "var(--palette-primary-main)"
              }
            }
          })}
        />
      </Tooltip>

      <Popover
        css={toolsSelectorStyles(theme)}
        open={isMenuOpen}
        anchorEl={buttonRef.current}
        onClose={handleClose}
        anchorOrigin={positionConfig.anchorOrigin}
        transformOrigin={positionConfig.transformOrigin}
        slotProps={{
          paper: {
            elevation: 24,
            style: {
              width: `${POPOVER_WIDTH}px`,
              height: `${POPOVER_HEIGHT}px`,
              maxHeight: "90vh",
              maxWidth: "100vw",
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }
          }
        }}
      >
        {/* Header with Search */}
        <Box
          sx={{
            p: 1.5,
            pl: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
            background: theme.vars.palette.background.paper
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              onSearchChange={handleSearchChange}
              placeholder="Search tools..."
              debounceTime={150}
              focusSearchInput={isMenuOpen}
              focusOnTyping
              width="100%"
              onPressEscape={handleClose}
            />
          </Box>
        </Box>

        {/* Main Content */}
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="items-container">
            {isLoading ? (
              <div className="loading-container">
                <CircularProgress size={24} />
              </div>
            ) : (!workflowTools || workflowTools.length === 0) &&
              selectedTools.length === 0 ? (
              <div className="no-tools-message">
                <Typography variant="body2">
                  No workflow tools available.
                  <br />
                  Set a workflow&apos;s run mode to &quot;tool&quot; to use it here.
                </Typography>
              </div>
            ) : (
              (filteredSortedTools?.length ? filteredSortedTools : []).map(
                (workflow) => {
                  const toolId = `workflow_${workflow.tool_name}`;
                  const isSelected = selectedTools.includes(toolId);
                  if (workflow.tool_name === null) {
                    return null;
                  }
                  return (
                    <Box
                      key={workflow.tool_name}
                      className={`workflow-tool-item ${isSelected ? "selected" : ""}`}
                      onClick={() => handleToggleTool(toolId)}
                      onMouseEnter={() =>
                        setHoveredToolName(workflow.tool_name ?? null)
                      }
                      onMouseLeave={() =>
                        setHoveredToolName((prev) =>
                          prev === workflow.tool_name ? null : prev
                        )
                      }
                    >
                      <Checkbox
                        size="small"
                        edge="start"
                        disableRipple
                        checked={isSelected}
                        tabIndex={-1}
                        sx={{
                          padding: 0,
                          color: theme.vars.palette.text.secondary,
                          "&.Mui-checked": {
                            color: theme.vars.palette.primary.main
                          }
                        }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <span className="workflow-name">{workflow.name}</span>
                        {workflow.description && (
                          <span className="workflow-description">
                            {workflow.description}
                          </span>
                        )}
                      </Box>
                    </Box>
                  );
                }
              )
            )}
            {!isLoading &&
              !isError &&
              workflowTools &&
              filteredSortedTools?.length === 0 && (
                <div className="no-tools-message">
                  <Typography variant="body2">No matching tools</Typography>
                </div>
              )}
          </div>

          {/* Hovered Tool Info */}
          {hoveredToolName && (() => {
            const t = workflowTools?.find((w) => w.tool_name === hoveredToolName);
            if (!t) {
              return null;
            }
            return (
              <Box
                sx={{
                  borderTop: `1px solid ${theme.vars.palette.divider}`,
                  p: 1.5,
                  flexShrink: 0,
                  bgcolor: theme.vars.palette.background.default
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ color: theme.vars.palette.text.primary, fontSize: "0.8rem" }}
                >
                  {t.name}
                </Typography>
                {t.description && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: theme.vars.palette.text.secondary,
                      mt: 0.5,
                      fontSize: "0.75rem"
                    }}
                  >
                    {t.description}
                  </Typography>
                )}
              </Box>
            );
          })()}
        </Box>
      </Popover>
    </>
  );
};

export default memo(WorkflowToolsSelector, isEqual);
