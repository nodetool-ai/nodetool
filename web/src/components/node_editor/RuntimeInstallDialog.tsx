/** @jsxImportSource @emotion/react */
/**
 * RuntimeInstallDialog
 *
 * Shown when a workflow is opened that needs runtimes the desktop app hasn't
 * installed yet. Lists each missing runtime with a live status chip and offers
 * a single "Install all" action that installs them sequentially through the
 * Electron runtime IPC. Falls back to opening the Package Manager route when
 * IPC is unavailable or an install fails.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Dialog,
  FlexColumn,
  FlexRow,
  Text,
  Chip,
  LoadingSpinner,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
} from "../ui_primitives";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {
  RUNTIME_LABELS,
  ensureRuntimeStatuses,
  getCachedRuntimeStatuses,
} from "../node/NodeDependencyWarning.helpers";
import { useOpenPackageManager } from "../../hooks/useOpenPackageManager";
import { createErrorMessage } from "../../utils/errorHandling";
import type { MissingRuntime } from "../../hooks/useWorkflowRuntimeCheck";

type RuntimeStatus = "pending" | "installing" | "installed" | "failed";

interface RuntimeInstallDialogProps {
  /** Missing runtimes detected for the current workflow. */
  missing: MissingRuntime[];
  open: boolean;
  /** Called when the user dismisses the dialog. */
  onClose: () => void;
}

interface RuntimeRowState {
  status: RuntimeStatus;
  /** Error message surfaced when status === "failed". */
  error?: string;
}

/**
 * Install each missing runtime sequentially, updating per-row state so the UI
 * reflects progress. Returns true only if every runtime ended up installed.
 */
async function installAll(
  missing: MissingRuntime[],
  setRowState: (id: string, patch: RuntimeRowState) => void
): Promise<boolean> {
  const api = window.api;
  if (!api?.packages?.installRuntime) return false;

  let allInstalled = true;
  for (const rt of missing) {
    setRowState(rt.id, { status: "installing" });
    try {
      const result = await api.packages.installRuntime(rt.packageId);
      if (result.success) {
        setRowState(rt.id, { status: "installed" });
      } else {
        setRowState(rt.id, { status: "failed", error: result.message });
        allInstalled = false;
      }
    } catch (err: unknown) {
      setRowState(rt.id, {
        status: "failed",
        error: createErrorMessage(err, "Install failed").message,
      });
      allInstalled = false;
    }
  }
  return allInstalled;
}

const STATUS_LABEL: Record<RuntimeStatus, string> = {
  pending: "Required",
  installing: "Installing…",
  installed: "Installed",
  failed: "Failed",
};

const STATUS_COLOR: Record<
  RuntimeStatus,
  "default" | "warning" | "info" | "success" | "error"
> = {
  pending: "default",
  installing: "info",
  installed: "success",
  failed: "error",
};

const RuntimeInstallDialog: React.FC<RuntimeInstallDialogProps> = ({
  missing,
  open,
  onClose,
}) => {
  const theme = useTheme();
  const openPackageManager = useOpenPackageManager();
  const [installing, setInstalling] = useState(false);
  const [rowStates, setRowStates] = useState<Record<string, RuntimeRowState>>(
    {}
  );

  // Reset per-row state whenever the set of missing runtimes changes.
  useEffect(() => {
    const next: Record<string, RuntimeRowState> = {};
    for (const rt of missing) {
      next[rt.id] = { status: "pending" };
    }
    setRowStates(next);
    setInstalling(false);
  }, [missing]);

  const setRowState = useCallback((id: string, patch: RuntimeRowState) => {
    setRowStates((prev) => ({ ...prev, [id]: patch }));
  }, []);

  const installedCount = useMemo(
    () =>
      Object.values(rowStates).filter((s) => s.status === "installed").length,
    [rowStates]
  );
  const failedCount = useMemo(
    () => Object.values(rowStates).filter((s) => s.status === "failed").length,
    [rowStates]
  );

  const allInstalled = missing.length > 0 && installedCount === missing.length;

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    const ok = await installAll(missing, setRowState);
    // Refresh the shared status cache so other surfaces
    // (NodeDependencyWarning, Package Manager) see the new state.
    await ensureRuntimeStatuses(true);
    void getCachedRuntimeStatuses();
    setInstalling(false);
    if (ok) {
      // Let the success state render briefly before auto-closing.
      setTimeout(onClose, 900);
    }
  }, [missing, setRowState, onClose]);

  const handleOpenPackageManager = useCallback(() => {
    onClose();
    openPackageManager();
  }, [onClose, openPackageManager]);

  const handleDialogClose = useCallback(
    (_e: unknown, reason: string) => {
      // Don't let backdrop clicks dismiss an in-flight install.
      if (installing && reason === "backdropClick") return;
      onClose();
    },
    [installing, onClose]
  );

  const runtimeNames = missing
    .map((r) => RUNTIME_LABELS[r.id] || r.id)
    .join(", ");

  const confirmText = allInstalled
    ? "Done"
    : installing
      ? "Installing…"
      : failedCount > 0
        ? "Retry"
        : "Install all";

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      title="Install required runtimes"
      minWidth="min(440px, 100vw - 32px)"
      onConfirm={allInstalled ? onClose : handleInstall}
      onCancel={onClose}
      confirmText={confirmText}
      cancelText="Later"
      isLoading={installing}
    >
      <FlexColumn gap={2}>
        <Text size="smaller" color="secondary">
          This workflow uses nodes that need{" "}
          <Text component="span" weight={500} color="inherit">
            {runtimeNames}
          </Text>
          . Install them now to run it.
        </Text>

        <FlexColumn
          gap={0.5}
          sx={{
            backgroundColor: theme.vars.palette.action.disabledBackground,
            borderRadius: BORDER_RADIUS.md,
            padding: getSpacingPx(SPACING.xs),
          }}
        >
          {missing.map((rt) => {
            const state = rowStates[rt.id] ?? { status: "pending" };
            return (
              <RuntimeRow
                key={rt.id}
                name={RUNTIME_LABELS[rt.id] || rt.id}
                status={state.status}
                error={state.error}
              />
            );
          })}
        </FlexColumn>

        {allInstalled && (
          <FlexRow gap={1} align="center">
            <CheckCircleOutlineIcon
              sx={{
                fontSize: "var(--fontSizeNormal)",
                color: theme.vars.palette.success.main,
              }}
            />
            <Text size="smaller" color="success">
              All runtimes installed. You can run this workflow now.
            </Text>
          </FlexRow>
        )}

        {!allInstalled && (
          <Text
            component="button"
            size="smaller"
            color="primary"
            onClick={installing ? undefined : handleOpenPackageManager}
            sx={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              cursor: installing ? "default" : "pointer",
              padding: 0,
              textDecoration: "underline",
              opacity: installing ? 0.5 : 1,
            }}
          >
            Open Package Manager instead
          </Text>
        )}
      </FlexColumn>
    </Dialog>
  );
};

interface RuntimeRowProps {
  name: string;
  status: RuntimeStatus;
  error?: string;
}

const RuntimeRow: React.FC<RuntimeRowProps> = ({ name, status, error }) => {
  return (
    <FlexRow
      gap={1}
      align="center"
      justify="space-between"
      fullWidth
      sx={{
        padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
        borderRadius: BORDER_RADIUS.sm,
      }}
    >
      <FlexColumn gap={0.25}>
        <FlexRow gap={1} align="center">
          {status === "installing" ? (
            <LoadingSpinner inline size={16} />
          ) : status === "installed" ? (
            <CheckCircleOutlineIcon
              sx={{ fontSize: 16, color: "var(--palette-success-main)" }}
            />
          ) : status === "failed" ? (
            <ErrorOutlineIcon
              sx={{ fontSize: 16, color: "var(--palette-error-main)" }}
            />
          ) : (
            <DownloadOutlinedIcon
              sx={{ fontSize: 16, color: "var(--palette-text-secondary)" }}
            />
          )}
          <Text size="small" weight={500}>
            {name}
          </Text>
        </FlexRow>
        {error && (
          <Text size="tinyer" color="error" sx={{ pl: 3 }}>
            {error}
          </Text>
        )}
      </FlexColumn>
      <Chip
        compact
        color={STATUS_COLOR[status]}
        active={status !== "pending"}
        label={error ? "Failed" : STATUS_LABEL[status]}
      />
    </FlexRow>
  );
};

export default memo(RuntimeInstallDialog);
