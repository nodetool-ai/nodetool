/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import {
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  Box,
  Divider
} from "@mui/material";
import { Text, Caption, FlexRow } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { createErrorMessage } from "../../utils/errorHandling";
import FolderIcon from "@mui/icons-material/Folder";
import AddIcon from "@mui/icons-material/Add";
import StarIcon from "@mui/icons-material/Star";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";

const styles = (theme: Theme) =>
  css({
    ".workspace-select": {
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "6px",
      "& .MuiSelect-select": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(1.5),
        padding: "10px 14px"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[600],
        transition: "border-color 0.2s ease"
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.primary.main
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.primary.main,
        borderWidth: "1px"
      }
    },
    ".workspace-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      width: "100%"
    },
    ".workspace-icon": {
      color: theme.vars.palette.primary.light,
      fontSize: "1.25rem",
      flexShrink: 0
    },
    ".workspace-details": {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".workspace-name": {
      fontSize: "0.875rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".workspace-path": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "monospace"
    },
    ".none-option": {
      color: theme.vars.palette.text.secondary,
      fontStyle: "italic",
      fontSize: "0.875rem"
    },
    ".create-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      color: theme.vars.palette.primary.main,
      fontSize: "0.875rem",
      fontWeight: 500
    },
    ".default-badge": {
      color: theme.vars.palette.warning.main,
      fontSize: "0.85rem",
      marginLeft: theme.spacing(0.5),
      verticalAlign: "middle"
    }
  });

// Fetch workspaces
const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces/", {
    params: { query: { limit: 100 } }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workspaces");
  }
  return data.workspaces;
};

interface WorkspaceSelectProps {
  value: string | undefined;
  onChange: (workspaceId: string | undefined) => void;
  label?: string;
  helperText?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}

const CREATE_NEW_VALUE = "__create_new__";

const WorkspaceSelect: React.FC<WorkspaceSelectProps> = memo(
  function WorkspaceSelect({
    value,
    onChange,
    fullWidth = true,
    disabled = false
  }) {
    const theme = useTheme();
    const setWorkspaceManagerOpen = useWorkspaceManagerStore(
      (state) => state.setIsOpen
    );

    const { data: workspaces, isLoading, error } = useQuery({
      queryKey: ["workspaces"],
      queryFn: fetchWorkspaces
    });

    const handleChange = useCallback(
      (event: { target: { value: string } }) => {
        const newValue = event.target.value;
        if (newValue === CREATE_NEW_VALUE) {
          setWorkspaceManagerOpen(true);
          return;
        }
        onChange(newValue === "" ? undefined : newValue);
      },
      [onChange, setWorkspaceManagerOpen]
    );

    // Find the selected workspace for display
    const selectedWorkspace = workspaces?.find((w) => w.id === value);

    if (isLoading) {
      return (
        <FlexRow css={styles(theme)} gap={1} align="center" sx={{ py: 1 }}>
          <CircularProgress size={18} />
          <Text size="small" color="secondary">
            Loading...
          </Text>
        </FlexRow>
      );
    }

    if (error) {
      return (
        <Box css={styles(theme)}>
          <Text size="small" color="error" sx={{ mb: 1 }}>
            Unable to load workspaces
          </Text>
          <Caption color="secondary">
            Check your connection or try again later
          </Caption>
        </Box>
      );
    }

    const renderSelectedValue = () => {
      if (!selectedWorkspace) {
        return <span className="none-option">No workspace selected</span>;
      }
      return (
        <div className="workspace-option">
          <FolderIcon className="workspace-icon" />
          <div className="workspace-details">
            <span className="workspace-name">
              {selectedWorkspace.name}
              {selectedWorkspace.is_default && (
                <StarIcon className="default-badge" />
              )}
            </span>
            <span className="workspace-path">{selectedWorkspace.path}</span>
          </div>
        </div>
      );
    };

    return (
      <FormControl fullWidth={fullWidth} css={styles(theme)}>
        <Select
          className="workspace-select"
          value={value || ""}
          onChange={handleChange}
          disabled={disabled}
          displayEmpty
          size="small"
          renderValue={renderSelectedValue}
          MenuProps={{
            PaperProps: {
              sx: {
                backgroundColor: theme.vars.palette.grey[800],
                border: `1px solid ${theme.vars.palette.grey[600]}`,
                borderRadius: "6px",
                mt: 0.5,
                "& .workspace-option": {
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%"
                },
                "& .workspace-icon": {
                  color: theme.vars.palette.primary.light,
                  fontSize: "1.25rem",
                  flexShrink: 0
                },
                "& .workspace-details": {
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden"
                },
                "& .workspace-name": {
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: theme.vars.palette.text.primary
                },
                "& .workspace-path": {
                  fontSize: "0.7rem",
                  color: theme.vars.palette.text.secondary,
                  fontFamily: "monospace"
                },
                "& .none-option": {
                  color: theme.vars.palette.text.secondary,
                  fontStyle: "italic",
                  fontSize: "0.875rem"
                },
                "& .create-option": {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: theme.vars.palette.primary.main,
                  fontSize: "0.875rem",
                  fontWeight: 500
                },
                "& .default-badge": {
                  color: theme.vars.palette.warning.main,
                  fontSize: "0.85rem",
                  marginLeft: "4px",
                  verticalAlign: "middle"
                },
                "& .MuiMenuItem-root": {
                  padding: "10px 14px",
                  borderRadius: "4px",
                  margin: "2px 4px",
                  "&:hover": {
                    backgroundColor: theme.vars.palette.grey[700]
                  },
                  "&.Mui-selected": {
                    backgroundColor: `${theme.vars.palette.primary.main}22`,
                    "&:hover": {
                      backgroundColor: `${theme.vars.palette.primary.main}33`
                    }
                  }
                }
              }
            }
          }}
        >
          <MenuItem value="">
            <span className="none-option">None</span>
          </MenuItem>
          {workspaces?.map((workspace) => (
            <MenuItem key={workspace.id} value={workspace.id}>
              <div className="workspace-option">
                <FolderIcon className="workspace-icon" />
                <div className="workspace-details">
                  <span className="workspace-name">
                    {workspace.name}
                    {workspace.is_default && (
                      <StarIcon className="default-badge" />
                    )}
                  </span>
                  <span className="workspace-path">{workspace.path}</span>
                </div>
              </div>
            </MenuItem>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <MenuItem value={CREATE_NEW_VALUE}>
            <span className="create-option">
              <AddIcon fontSize="small" />
              Create New Workspace
            </span>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }
);

WorkspaceSelect.displayName = "WorkspaceSelect";

export default WorkspaceSelect;
