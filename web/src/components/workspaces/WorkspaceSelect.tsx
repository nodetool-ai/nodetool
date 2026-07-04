/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo } from "react";

import {
  Text,
  Caption,
  FlexRow,
  Box,
  Divider,
  LoadingSpinner,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  FormControl,
  Select,
  MenuItem
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useFolderPicker } from "./useFolderPicker";
import FolderIcon from "@mui/icons-material/Folder";
import AddIcon from "@mui/icons-material/Add";
import StarIcon from "@mui/icons-material/Star";

const styles = (theme: Theme) =>
  css({
    ".workspace-select": {
      backgroundColor: "transparent",
      borderRadius: BORDER_RADIUS.md,
      "& .MuiSelect-select": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(1.5),
        padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}` // was 10px 14px
      },
      "&.compact .MuiSelect-select": {
        padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}` // was 4px 10px
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider,
        transition: MOTION.border
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[600]
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[600],
        borderWidth: "1px"
      }
    },
    ".workspace-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      width: "100%",
      overflow: "hidden"
    },
    ".workspace-icon": {
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeBig)",
      flexShrink: 0,
      opacity: 0.7
    },
    ".workspace-path": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 400,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "monospace"
    },
    ".workspace-path-inline": {
      color: theme.vars.palette.text.disabled,
      fontFamily: "monospace",
      fontSize: "var(--fontSizeSmall)"
    },
    ".none-option": {
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      fontSize: "var(--fontSizeNormal)"
    },
    ".create-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 400
    },
    ".default-badge": {
      color: theme.vars.palette.text.disabled,
      fontSize: "var(--fontSizeNormal)",
      marginLeft: theme.spacing(0.5),
      verticalAlign: "middle",
      opacity: 0.6
    }
  });

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

/** Derive a workspace name from an absolute folder path. */
function nameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Compact label shows only the folder basename. */
function compactPath(path: string): string {
  const base = nameFromPath(path);
  return base || path;
}

interface WorkspaceSelectProps {
  value: string | undefined;
  onChange: (workspaceId: string | undefined) => void;
  helperText?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const CREATE_NEW_VALUE = "__create_new__";

const setWorkspacesData = (
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (workspaces: WorkspaceResponse[]) => WorkspaceResponse[]
) => {
  queryClient.setQueryData<WorkspaceResponse[]>(["workspaces"], (prev) =>
    updater(prev ?? [])
  );
};

const WorkspaceSelect: React.FC<WorkspaceSelectProps> = memo(
  function WorkspaceSelect({
    value,
    onChange,
    helperText,
    fullWidth = true,
    disabled = false,
    compact = false
  }) {
    const theme = useTheme();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const queryClient = useQueryClient();
    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );
    const { pickFolder, dialog: folderPickerDialog } = useFolderPicker();

    const { data: workspaces, isLoading, error } = useQuery({
      queryKey: ["workspaces"],
      queryFn: fetchWorkspaces
    });

    const createMutation = useMutation({
      mutationFn: async (path: string) => {
        return trpcClient.workspace.create.mutate({
          name: nameFromPath(path),
          path,
          is_default: false
        });
      },
      onSuccess: (created) => {
        setWorkspacesData(queryClient, (prev) => {
          if (prev.some((w) => w.id === created.id)) return prev;
          return [...prev, created as WorkspaceResponse];
        });
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        onChange(created.id);
        addNotification({
          type: "success",
          alert: true,
          content: "Workspace added",
          dismissable: true
        });
      },
      onError: (error) => {
        addNotification({
          type: "error",
          alert: true,
          content: String(error),
          dismissable: true
        });
      }
    });

    const handleChange = useCallback(
      async (event: { target: { value: string } }) => {
        const newValue = event.target.value;
        if (newValue === CREATE_NEW_VALUE) {
          const path = await pickFolder();
          if (path) {
            createMutation.mutate(path);
          }
          return;
        }
        onChange(newValue === "" ? undefined : newValue);
      },
      [onChange, pickFolder, createMutation]
    );

    const selectedWorkspace = workspaces?.find((w) => w.id === value);

    if (isLoading) {
      return (
        <FlexRow css={cssStyles} gap={1} align="center" sx={{ py: 1 }}>
          <LoadingSpinner size="small" />
          <Text size="small" color="secondary">
            Loading…
          </Text>
        </FlexRow>
      );
    }

    if (error) {
      return (
        <Box css={cssStyles}>
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
          <span className="workspace-path" title={selectedWorkspace.path}>
            {compact
              ? compactPath(selectedWorkspace.path)
              : selectedWorkspace.path}
            {selectedWorkspace.is_default && (
              <StarIcon className="default-badge" />
            )}
          </span>
        </div>
      );
    };

    return (
      <>
        <FormControl fullWidth={fullWidth} css={cssStyles}>
          <Select
            className={`workspace-select${compact ? " compact" : ""}`}
            value={value || ""}
            onChange={handleChange}
            disabled={disabled || createMutation.isPending}
            displayEmpty
            size="small"
            renderValue={renderSelectedValue}
            MenuProps={{
              PaperProps: {
                sx: {
                  maxWidth: "min(600px, calc(100vw - 32px))",
                  backgroundColor: theme.vars.palette.background.paper,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: BORDER_RADIUS.md,
                  mt: 0.5,
                  "& .workspace-option": {
                    display: "flex",
                    alignItems: "center",
                    gap: getSpacingPx(SPACING.lg),
                    width: "100%",
                    overflow: "hidden"
                  },
                  "& .workspace-icon": {
                    color: theme.vars.palette.text.secondary,
                    fontSize: "var(--fontSizeBig)",
                    flexShrink: 0,
                    opacity: 0.7
                  },
                  "& .workspace-path": {
                    fontSize: "var(--fontSizeNormal)",
                    fontWeight: 400,
                    color: theme.vars.palette.text.secondary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontFamily: "monospace"
                  },
                  "& .none-option": {
                    color: theme.vars.palette.text.disabled,
                    fontStyle: "italic",
                    fontSize: "var(--fontSizeNormal)"
                  },
                  "& .create-option": {
                    display: "flex",
                    alignItems: "center",
                    gap: getSpacingPx(SPACING.md),
                    color: theme.vars.palette.text.secondary,
                    fontSize: "var(--fontSizeNormal)",
                    fontWeight: 400
                  },
                  "& .default-badge": {
                    color: theme.vars.palette.text.disabled,
                    fontSize: "var(--fontSizeNormal)",
                    marginLeft: getSpacingPx(SPACING.xs),
                    verticalAlign: "middle",
                    opacity: 0.6
                  },
                  "& .MuiMenuItem-root": {
                    padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`, // was 10px 14px
                    borderRadius: BORDER_RADIUS.sm,
                    margin: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
                    "&:hover": {
                      backgroundColor: theme.vars.palette.action.hover
                    },
                    "&.Mui-selected": {
                      backgroundColor: theme.vars.palette.action.selected,
                      "&:hover": {
                        backgroundColor: theme.vars.palette.action.hover
                      }
                    }
                  }
                }
              }
            }}
          >
            <Box
              role="note"
              sx={{
                px: 2,
                pt: 1,
                pb: 1,
                pointerEvents: "none"
              }}
            >
              <Caption
                size="smaller"
                color="muted"
                sx={{
                  display: "block",
                  lineHeight: 1.5,
                  whiteSpace: "normal",
                  wordBreak: "break-word"
                }}
              >
                Agents read and write files here during execution - saved images,
                text, data, and other outputs. Browse the results in the Workspace
                panel. Agents can only access files inside this folder.
              </Caption>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
            <MenuItem value="">
              <span className="none-option">None</span>
            </MenuItem>
            {workspaces?.map((workspace) => (
              <MenuItem key={workspace.id} value={workspace.id}>
                <div className="workspace-option">
                  <FolderIcon className="workspace-icon" />
                  <span className="workspace-path" title={workspace.path}>
                    {workspace.path}
                    {workspace.is_default && (
                      <StarIcon className="default-badge" />
                    )}
                  </span>
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
          {helperText && (
            <Caption color="secondary" sx={{ mt: 0.5, ml: 0.5 }}>
              {helperText}
            </Caption>
          )}
        </FormControl>
        {folderPickerDialog}
      </>
    );
  }
);

WorkspaceSelect.displayName = "WorkspaceSelect";

export default WorkspaceSelect;
