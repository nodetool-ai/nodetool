/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Checkbox,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import type { WorkflowTool } from "../../../stores/ApiTypes";
import { apiClient } from "../../../stores/ApiClient";

const styles = (theme: Theme) =>
  css({
    ".tools-button": {
      textTransform: "none",
      padding: "4px 8px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.primary,
      fontSize: theme.fontSizeSmall,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.primary.main
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
    }
  });

const dialogStyles = (theme: Theme) =>
  css({
    ".dialog-content": {
      minWidth: 400,
      maxHeight: "60vh"
    },
    ".search-field": {
      marginBottom: theme.spacing(2)
    },
    ".tool-list": {
      maxHeight: 350,
      overflow: "auto"
    },
    ".tool-item": {
      borderRadius: "4px",
      marginBottom: "2px",
      padding: theme.spacing(1),
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`
      }
    },
    ".tool-info": {
      flex: 1,
      minWidth: 0
    },
    ".tool-name": {
      fontSize: theme.fontSizeNormal,
      fontWeight: 500,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".tool-description": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
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
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [workflowTools, setWorkflowTools] = useState<WorkflowTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Get selected workflow tools (prefixed with workflow_)
  const selectedTools = useMemo(
    () => value.filter((tool) => tool.startsWith("workflow_")),
    [value]
  );

  // Fetch workflow tools when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;

    const fetchTools = async () => {
      setIsLoading(true);
      try {
        const { data } = await apiClient.getWorkflowTools();
        if (data) {
          setWorkflowTools(data);
        }
      } catch (error) {
        console.error("Failed to fetch workflow tools:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTools();
  }, [dialogOpen]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
    setSearchTerm("");
  }, []);

  const handleToggleTool = useCallback(
    (toolId: string) => {
      const newTools = selectedTools.includes(toolId)
        ? selectedTools.filter((id) => id !== toolId)
        : [...selectedTools, toolId];
      // Merge with non-workflow tools
      const otherTools = value.filter((tool) => !tool.startsWith("workflow_"));
      onChange([...otherTools, ...newTools]);
    },
    [selectedTools, value, onChange]
  );

  // Filter and sort tools
  const filteredTools = useMemo(() => {
    let tools = workflowTools.filter((t) => t.tool_name !== null);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      tools = tools.filter(
        (t) =>
          (t.name || "").toLowerCase().includes(term) ||
          (t.description || "").toLowerCase().includes(term)
      );
    }

    // Sort: selected first, then alphabetically
    return tools.sort((a, b) => {
      const aSelected = selectedTools.includes(`workflow_${a.tool_name}`);
      const bSelected = selectedTools.includes(`workflow_${b.tool_name}`);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [workflowTools, searchTerm, selectedTools]);

  const selectedCount = selectedTools.length;

  return (
    <>
      <Tooltip
        title={
          selectedCount > 0
            ? `${selectedCount} workflow tools selected`
            : "Select Workflow Tools"
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={`tools-button ${selectedCount > 0 ? "active" : ""}`}
          css={styles(theme)}
          onClick={handleClick}
          size="small"
          startIcon={<AccountTreeIcon sx={{ fontSize: 16 }} />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                size="small"
                label={selectedCount}
                sx={{
                  height: 18,
                  fontSize: "0.7rem",
                  "& .MuiChip-label": { px: 0.5 }
                }}
              />
            )
          }
        >
          Tools
        </Button>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        css={dialogStyles(theme)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          backdrop: {
            style: { backdropFilter: "blur(8px)" }
          }
        }}
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: 2,
            border: `1px solid ${theme.vars.palette.divider}`
          }
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AccountTreeIcon />
            Workflow Tools
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent className="dialog-content">
          <TextField
            className="search-field"
            fullWidth
            size="small"
            placeholder="Search workflow tools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
            sx={{ mb: 2 }}
          />

          {/* Tool list */}
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredTools.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: "center", p: 2 }}
            >
              {workflowTools.length === 0
                ? "No workflow tools available. Set a workflow's run mode to \"tool\" to use it here."
                : "No tools match your search."}
            </Typography>
          ) : (
            <List className="tool-list" dense>
              {filteredTools.map((tool) => {
                const toolId = `workflow_${tool.tool_name}`;
                const isSelected = selectedTools.includes(toolId);
                return (
                  <ListItemButton
                    key={tool.tool_name}
                    className={`tool-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleToggleTool(toolId)}
                  >
                    <Checkbox
                      checked={isSelected}
                      size="small"
                      sx={{ p: 0, mr: 1 }}
                    />
                    <Box className="tool-info">
                      <Typography className="tool-name">{tool.name}</Typography>
                      {tool.description && (
                        <Typography className="tool-description">
                          {tool.description}
                        </Typography>
                      )}
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(WorkflowToolsSelector);
