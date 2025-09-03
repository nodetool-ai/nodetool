/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  Button,
  Menu,
  MenuItem,
  Typography,
  Box,
  Tooltip,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Chip
} from "@mui/material";
import { isEqual } from "lodash";
import {
  AccountTree,
  CheckBox,
  CheckBoxOutlineBlank
} from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useWorkflowTools } from "../../../serverState/useWorkflowTools";
import { useTheme } from "@mui/material/styles";

const menuStyles = (theme: Theme) =>
  css({
    "& .MuiMenu-paper": {
      maxHeight: "400px",
      minWidth: "320px"
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      padding: theme.spacing(2)
    },
    ".workflow-tool-item": {
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600]
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.grey[600]
      }
    },
    ".workflow-name": {
      color: theme.vars.palette.grey[0],
      fontSize: "0.875rem"
    },
    ".workflow-description": {
      color: theme.vars.palette.grey[200],
      fontSize: "0.75rem",
      marginTop: "2px"
    },
    ".no-tools-message": {
      padding: theme.spacing(2),
      color: theme.vars.palette.grey[200],
      textAlign: "center"
    },
    ".selected-count": {
      marginLeft: theme.spacing(1),
      backgroundColor: "var(--palette-primary-main)",
      color: theme.vars.palette.grey[1000],
      "& .MuiChip-label": {
        padding: "0 4px"
      }
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);
  const selectedTools = useMemo(
    () => value.filter((tool) => tool !== "workflow_null") || [],
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

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
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

  console.log(selectedTools, workflowTools);

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
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        css={menuStyles(theme)}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        {isLoading ? (
          <Box className="loading-container">
            <CircularProgress size={24} />
          </Box>
        ) : isError ? (
          <MenuItem disabled>
            <ListItemText primary="Error loading workflow tools" />
          </MenuItem>
        ) : !workflowTools || workflowTools.length === 0 ? (
          <Typography className="no-tools-message">
            No workflow tools available.
            <br />
            Set a workflow&apos;s run mode to &quot;tool&quot; to use it here.
          </Typography>
        ) : (
          workflowTools.map((workflow) => {
            const toolId = `workflow_${workflow.tool_name}`;
            const isSelected = selectedTools.includes(toolId);
            if (workflow.tool_name === null) {
              return null;
            }

            return (
              <MenuItem
                key={workflow.tool_name}
                onClick={() => handleToggleTool(toolId)}
                className={`workflow-tool-item ${isSelected ? "selected" : ""}`}
              >
                <ListItemIcon>
                  {isSelected ? (
                    <CheckBox
                      fontSize="small"
                      sx={{ color: "var(--palette-primary-main)" }}
                    />
                  ) : (
                    <CheckBoxOutlineBlank
                      fontSize="small"
                      sx={{ color: "var(--palette-grey-200)" }}
                    />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <span className="workflow-name">{workflow.name}</span>
                  }
                  secondary={
                    workflow.description && (
                      <span className="workflow-description">
                        {workflow.description}
                      </span>
                    )
                  }
                />
              </MenuItem>
            );
          })
        )}
      </Menu>
    </>
  );
};

export default memo(WorkflowToolsSelector, isEqual);
