/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

import ErrorBanner from "../support/ErrorBanner";
import {
  Text,
  Caption,
  FlexRow,
  Box,
  Divider,
  FormField,
  LoadingSpinner,
  SPACING,
  FormControl,
  Select,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMutation } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useWorkspaces,
  useWorkspaceCacheWriter
} from "../../hooks/useWorkspaces";
import { useFolderPicker } from "./useFolderPicker";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import AddIcon from "@mui/icons-material/AddOutlined";
import StarIcon from "@mui/icons-material/Star";

const styles = (theme: Theme) =>
  css({
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
      fontFamily: "var(--fontFamily2)"
    },
    ".workspace-path-inline": {
      color: theme.vars.palette.text.disabled,
      fontFamily: "var(--fontFamily2)",
      fontSize: "var(--fontSizeSmall)"
    },
    ".none-option": {
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      fontSize: "var(--fontSizeNormal)"
    },
    ".default-badge": {
      color: theme.vars.palette.text.disabled,
      fontSize: "var(--fontSizeNormal)",
      marginLeft: theme.spacing(0.5),
      verticalAlign: "middle",
      opacity: 0.6
    }
  });

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
  readonly value: string | undefined;
  readonly onChange: (workspaceId: string | undefined) => void;
  readonly projectId?: string;
  /** Visible field label. Without it the select is named "Workspace" for
   *  assistive tech only (toolbar use). */
  readonly label?: string;
  readonly helperText?: string;
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  readonly compact?: boolean;
}

const CREATE_NEW_VALUE = "__create_new__";

const WorkspaceSelect: React.FC<WorkspaceSelectProps> = memo(
  function WorkspaceSelect({
    value,
    onChange,
    projectId,
    label,
    helperText,
    fullWidth = true,
    disabled = false,
    compact = false
  }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const fieldId = useId();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const writeWorkspaceToCache = useWorkspaceCacheWriter(projectId);
    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );
    const { pickFolder, dialog: folderPickerDialog } = useFolderPicker();

    const { workspaces, canManage, defaultWorkspace, isLoading, error } =
      useWorkspaces(projectId);

    const createMutation = useMutation({
      mutationFn: async (path: string) => {
        const input = {
          name: nameFromPath(path),
          path,
          is_default: false
        };
        return trpcClient.workspace.create.mutate(
          projectId ? { ...input, project_id: projectId } : input
        );
      },
      onSuccess: (created) => {
        writeWorkspaceToCache(created as WorkspaceResponse);
        onChange(created.id);
        addNotification({
          type: "success",
          alert: true,
          content: t("batch2_1.notifications.added"),
          dismissable: true
        });
      },
      onError: (error) => {
        addNotification({
          type: "error",
          alert: true,
          content: t("batch2_1.errors.operation", { error: String(error) }),
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

    const selectedWorkspace = workspaces.find((w) => w.id === value);

    if (isLoading) {
      return (
        <FlexRow css={cssStyles} gap={1} align="center" sx={{ py: 1 }}>
          <LoadingSpinner size="small" />
          <Text size="small" color="secondary">
            {t("batch2_1.common.loading")}
          </Text>
        </FlexRow>
      );
    }

    if (error) {
      return (
        <Box css={cssStyles}>
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("batch2_1.errors.loadSummary"),
              errorText: error instanceof Error ? error.message : String(error)
            }}
          >
            {t("batch2_1.errors.loadDescription")}
          </ErrorBanner>
        </Box>
      );
    }

    const renderSelectedValue = () => {
      if (!selectedWorkspace) {
        // An unset workflow follows the default workspace at run time, so name
        // it here rather than claiming the run has nowhere to write.
        return (
          <span className="none-option">
            {defaultWorkspace
              ? t("batch2_1.select.defaultWithPath", { path: compactPath(defaultWorkspace.path) })
              : t("batch2_1.manager.defaultWorkspace")}
          </span>
        );
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

    const labeled = Boolean(label) || Boolean(helperText);
    const visibleLabel = labeled ? label ?? t("batch2_1.common.workspace") : undefined;

    const select = (
      <FormControl fullWidth={fullWidth} css={cssStyles}>
        <Select
          className={`workspace-select${compact ? " compact" : ""}`}
          id={labeled ? fieldId : undefined}
          labelId={labeled ? `${fieldId}-label` : undefined}
          aria-label={labeled ? undefined : t("batch2_1.common.workspace")}
          value={value || ""}
          onChange={handleChange}
          disabled={disabled || createMutation.isPending}
          displayEmpty
          size="small"
          renderValue={renderSelectedValue}
          MenuProps={{
            slotProps: {
              paper: {
                sx: { maxWidth: "min(600px, calc(100vw - 32px))" }
              }
            }
          }}
        >
          <Box
            role="note"
            sx={{
              px: SPACING.lg,
              py: SPACING.md,
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
              {t("batch2_1.select.description")}
            </Caption>
          </Box>
          <Divider />
          <MenuItem value="">
            <ListItemText primary={t("batch2_1.manager.defaultWorkspace")} />
          </MenuItem>
          {workspaces.map((workspace) => (
            <MenuItem key={workspace.id} value={workspace.id}>
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText
                primary={workspace.path}
                title={workspace.path}
                slotProps={{ primary: { noWrap: true } }}
                sx={{ minWidth: 0 }}
              />
              {workspace.is_default && (
                <ListItemIcon>
                  <StarIcon />
                </ListItemIcon>
              )}
            </MenuItem>
          ))}
          {canManage && <Divider />}
          {canManage && (
            <MenuItem value={CREATE_NEW_VALUE}>
              <ListItemIcon>
                <AddIcon />
              </ListItemIcon>
              <ListItemText primary={t("batch2_1.select.createNew")} />
            </MenuItem>
          )}
        </Select>
      </FormControl>
    );

    return (
      <>
        {labeled ? (
          <FormField
            label={visibleLabel}
            helperText={helperText}
            htmlFor={fieldId}
          >
            {select}
          </FormField>
        ) : (
          select
        )}
        {folderPickerDialog}
      </>
    );
  }
);

WorkspaceSelect.displayName = "WorkspaceSelect";

export default WorkspaceSelect;
