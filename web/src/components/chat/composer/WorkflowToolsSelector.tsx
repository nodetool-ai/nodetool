/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  Button,
  Typography,
  Box,
  Tooltip,
  CircularProgress,
  Chip,
  Checkbox,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle
} from "@mui/material";
import isEqual from "lodash/isEqual";
import { AccountTree, Close } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useWorkflowTools } from "../../../serverState/useWorkflowTools";
import { useTheme } from "@mui/material/styles";
import SearchInput from "../../search/SearchInput";

const toolsSelectorStyles = (theme: Theme) =>
  css({
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: theme.spacing(4, 4),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      h4: {
        margin: 0,
        fontSize: (theme as any).fontSizeNormal ?? undefined,
        fontWeight: 500,
        color: theme.vars.palette.grey[100]
      }
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(2),
      color: theme.vars.palette.grey[500]
    },
    ".selector-grid": {
      display: "flex",
      flexDirection: "row",
      gap: theme.spacing(2),
      alignItems: "stretch",
      height: "65vh"
    },
    ".left-pane": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minWidth: 0
    },
    ".right-pane": {
      width: 360,
      minWidth: 320,
      maxWidth: 420,
      borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
      padding: theme.spacing(0, 1.5, 1.5, 1.5),
      background: "transparent",
      position: "sticky",
      top: 0,
      alignSelf: "flex-start",
      height: "100%",
      overflow: "auto"
    },
    ".selector-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      paddingTop: theme.spacing(1)
    },
    ".search-toolbar": {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: "0.5em",
      minHeight: "40px",
      flexGrow: 0,
      overflow: "hidden",
      width: "60%",
      margin: 0,
      padding: ".5em 1em .5em .7em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      ".search-input-container": {
        minWidth: "170px",
        flex: 1
      }
    },
    ".items-container": {
      flex: 1,
      overflow: "auto",
      padding: "0 1em",
      height: "100%"
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
      padding: theme.spacing(1, 1),
      borderRadius: 6,
      cursor: "pointer",
      borderLeft: "3px solid transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600]
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.grey[600],
        borderLeft: `3px solid var(--palette-primary-main)`
      }
    },
    ".workflow-name": {
      color: theme.vars.palette.grey[0],
      fontSize: "0.875rem",
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workflow-description": {
      color: theme.vars.palette.grey[200],
      fontSize: "0.75rem",
      marginTop: "2px",
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".no-tools-message": {
      padding: theme.spacing(4),
      color: theme.vars.palette.grey[200],
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
    if (!workflowTools) return [] as typeof workflowTools;
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
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [workflowTools, searchTerm, selectedTools]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
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

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

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
          className={`workflow-tools-button ${
            selectedTools.length > 0 ? "active" : ""
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
      <Dialog
        css={toolsSelectorStyles(theme)}
        className="workflow-tools-selector-dialog"
        open={isMenuOpen}
        onClose={handleClose}
        aria-labelledby="workflow-tools-selector-title"
        slotProps={{
          backdrop: {
            style: { backdropFilter: "blur(20px)" }
          }
        }}
        sx={(theme) => ({
          "& .MuiDialog-paper": {
            width: "92%",
            maxWidth: "1000px",
            margin: "auto",
            borderRadius: 1.5,
            background: "transparent",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          }
        })}
      >
        <DialogTitle className="dialog-title">
          <Typography variant="h4" id="workflow-tools-selector-title">
            Workflow Tools
          </Typography>
          <Tooltip title="Close">
            <IconButton
              aria-label="close"
              onClick={handleClose}
              className="close-button"
            >
              <Close />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ background: "transparent", pt: 2 }}>
          <div className="search-toolbar">
            <SearchInput
              focusSearchInput={isMenuOpen}
              focusOnTyping={false}
              placeholder="Search tools..."
              debounceTime={150}
              width={300}
              maxWidth="100%"
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              onPressEscape={handleClose}
              searchResults={[]}
            />
          </div>
          <div className="selector-grid">
            <div className="left-pane selector-content">
              <div className="items-container">
                {isLoading ? (
                  <div className="loading-container">
                    <CircularProgress size={24} />
                  </div>
                ) : (!workflowTools || workflowTools.length === 0) &&
                  selectedTools.length === 0 ? (
                  <div className="no-tools-message">
                    <Typography>
                      No workflow tools available.
                      <br />
                      Set a workflow&apos;s run mode to &quot;tool&quot; to use
                      it here.
                    </Typography>
                  </div>
                ) : (
                  (filteredSortedTools?.length ? filteredSortedTools : []).map(
                    (workflow) => {
                      const toolId = `workflow_${workflow.tool_name}`;
                      const isSelected = selectedTools.includes(toolId);
                      if (workflow.tool_name === null) return null;
                      return (
                        <Box
                          key={workflow.tool_name}
                          className={`workflow-tool-item ${
                            isSelected ? "selected" : ""
                          }`}
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
                              color: "var(--palette-grey-200)",
                              "&.Mui-checked": {
                                color: "var(--palette-primary-main)"
                              }
                            }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <span className="workflow-name">
                              {workflow.name}
                            </span>
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
                      <Typography>No matching tools</Typography>
                    </div>
                  )}
              </div>
            </div>
            <div className="right-pane">
              {hoveredToolName &&
                (() => {
                  const t = workflowTools?.find(
                    (w) => w.tool_name === hoveredToolName
                  );
                  if (!t) return null;
                  return (
                    <Box sx={{ p: 1.5 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{ color: theme.vars.palette.grey[100] }}
                      >
                        {t.name}
                      </Typography>
                      {t.description && (
                        <Typography
                          variant="body2"
                          sx={{ color: theme.vars.palette.grey[300], mt: 0.5 }}
                        >
                          {t.description}
                        </Typography>
                      )}
                    </Box>
                  );
                })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default memo(WorkflowToolsSelector, isEqual);
