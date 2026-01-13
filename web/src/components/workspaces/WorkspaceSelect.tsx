/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import {
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  FormHelperText,
  CircularProgress,
  Box,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { createErrorMessage } from "../../utils/errorHandling";
import FolderIcon from "@mui/icons-material/Folder";

const styles = (theme: Theme) =>
  css({
    ".workspace-select": {
      "& .MuiSelect-select": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(1)
      }
    },
    ".workspace-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    ".workspace-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "1.2rem"
    },
    ".workspace-details": {
      display: "flex",
      flexDirection: "column"
    },
    ".workspace-name": {
      fontSize: "0.875rem"
    },
    ".workspace-path": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary
    }
  });

// Fetch workspaces
const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces", {
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
}

const WorkspaceSelect: React.FC<WorkspaceSelectProps> = memo(
  function WorkspaceSelect({
    value,
    onChange,
    label = "Workspace",
    helperText = "Select a workspace folder for this workflow",
    fullWidth = true
  }) {
    const theme = useTheme();

    const { data: workspaces, isLoading, error } = useQuery({
      queryKey: ["workspaces"],
      queryFn: fetchWorkspaces
    });

    const handleChange = useCallback(
      (event: { target: { value: string } }) => {
        const newValue = event.target.value;
        onChange(newValue === "" ? undefined : newValue);
      },
      [onChange]
    );

    if (isLoading) {
      return (
        <FormControl fullWidth={fullWidth}>
          <FormLabel>{label}</FormLabel>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading workspaces...
            </Typography>
          </Box>
        </FormControl>
      );
    }

    if (error) {
      return (
        <FormControl fullWidth={fullWidth} error>
          <FormLabel>{label}</FormLabel>
          <FormHelperText>Failed to load workspaces</FormHelperText>
        </FormControl>
      );
    }

    return (
      <FormControl fullWidth={fullWidth} css={styles(theme)}>
        <FormLabel>{label}</FormLabel>
        <Select
          className="workspace-select"
          value={value || ""}
          onChange={handleChange}
          displayEmpty
          size="small"
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {workspaces?.map((workspace) => (
            <MenuItem key={workspace.id} value={workspace.id}>
              <div className="workspace-option">
                <FolderIcon className="workspace-icon" />
                <div className="workspace-details">
                  <span className="workspace-name">{workspace.name}</span>
                  <span className="workspace-path">{workspace.path}</span>
                </div>
              </div>
            </MenuItem>
          ))}
        </Select>
        {helperText && <FormHelperText>{helperText}</FormHelperText>}
      </FormControl>
    );
  }
);

WorkspaceSelect.displayName = "WorkspaceSelect";

export default WorkspaceSelect;
