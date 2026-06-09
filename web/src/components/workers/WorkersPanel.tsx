/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  FlexColumn,
  FlexRow,
  Card,
  Text,
  Caption,
  LoadingSpinner,
  EditorButton,
  Dialog,
  SelectField,
  StatusIndicator,
  AlertBanner,
  WarningBanner,
  type StatusType
} from "../ui_primitives";
import {
  useWorkers,
  useWorkerHealth,
  type WorkerInstance
} from "../../hooks/useWorkers";
import WorkerProfilesDialog from "./WorkerProfilesDialog";

/**
 * Workers panel — the live GPU-worker surface. Lists provisioned instances with
 * their status, uptime, and estimated cost; lets the user provision a new worker
 * from a profile; and surfaces real teardown (Stop / Stop All) because GPU pods
 * bill continuously. Built entirely on `ui_primitives`.
 */

const STATUS_TONE: Record<string, StatusType> = {
  provisioning: "pending",
  running: "info",
  attached: "success",
  stopping: "pending",
  stopped: "default",
  error: "error"
};

const panelStyles = (theme: Theme) =>
  css({
    "&": {
      height: "100%"
    },
    ".panel-header": {
      paddingBottom: "0.75em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    }
  });

function formatUptime(createdAt: string, now: number): string {
  const startedMs = Date.parse(createdAt);
  if (Number.isNaN(startedMs)) return "—";
  const seconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "—";
  return `$${cost.toFixed(2)}`;
}

function formatRate(cost: number): string {
  return `$${cost.toFixed(2)}/hr`;
}

function statusTone(status: string): StatusType {
  return STATUS_TONE[status] ?? "default";
}

interface ProvisionDialogProps {
  open: boolean;
  profileNames: string[];
  onProvision: (profileName: string) => void;
  onClose: () => void;
  isProvisioning: boolean;
}

const ProvisionDialog: React.FC<ProvisionDialogProps> = ({
  open,
  profileNames,
  onProvision,
  onClose,
  isProvisioning
}) => {
  const [selected, setSelected] = useState<string>(profileNames[0] ?? "");
  const effective = profileNames.includes(selected)
    ? selected
    : (profileNames[0] ?? "");

  const options = useMemo(
    () => profileNames.map((name) => ({ value: name, label: name })),
    [profileNames]
  );

  const handleProvision = useCallback(() => {
    if (effective) {
      onProvision(effective);
    }
  }, [effective, onProvision]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start a worker"
      minWidth={420}
      actions={
        <FlexRow gap={2}>
          <EditorButton variant="text" onClick={onClose}>
            Cancel
          </EditorButton>
          <EditorButton
            variant="outlined"
            onClick={handleProvision}
            disabled={!effective || isProvisioning}
          >
            Provision
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={2} sx={{ pt: 1 }}>
        {profileNames.length === 0 ? (
          <Caption size="small">
            No worker profiles yet. Open <strong>Manage Profiles</strong> to
            create one.
          </Caption>
        ) : (
          <SelectField
            label="Profile"
            value={effective}
            onChange={setSelected}
            options={options}
            variant="standard"
          />
        )}
      </FlexColumn>
    </Dialog>
  );
};

interface InstanceRowProps {
  instance: WorkerInstance;
  now: number;
  onStop: (id: string) => void;
  onResume: (id: string) => void;
  onTerminate: (id: string) => void;
  onAttach: (id: string) => void;
  onDetach: () => void;
  stopping: boolean;
  busy: boolean;
}

const InstanceRow: React.FC<InstanceRowProps> = ({
  instance,
  now,
  onStop,
  onResume,
  onTerminate,
  onAttach,
  onDetach,
  stopping,
  busy
}) => {
  const isAttached = instance.status === "attached";
  const isPaused = instance.status === "stopped";
  const isRunning = instance.status === "running";

  // While a worker is `running` but not attached, "running" only means the
  // pod's port is mapped — not that the worker process is serving. Probe its
  // real readiness so the user knows when it's safe to attach.
  const healthQuery = useWorkerHealth(instance.id, isRunning);
  const isHealthy = healthQuery.data?.healthy === true;
  const isBooting = isRunning && !isHealthy;

  // Effective status presentation: the raw status, except a `running` worker is
  // shown as "booting" until it answers the probe, then "ready".
  const displayLabel = isRunning
    ? isHealthy
      ? "ready"
      : "booting"
    : instance.status;
  const displayTone: StatusType = isRunning
    ? isHealthy
      ? "success"
      : "pending"
    : statusTone(instance.status);
  const statusHint = isBooting
    ? "GPU up — worker still loading"
    : isRunning && isHealthy
      ? "Worker is answering — safe to attach"
      : null;

  return (
    <Card variant="outlined" padding="normal">
      <FlexRow align="center" justify="space-between" gap={3}>
        <FlexColumn gap={0.5}>
          <FlexRow gap={2} align="center">
            <Text size="normal" weight={600}>
              {instance.profile_name}
            </Text>
            <StatusIndicator
              status={displayTone}
              label={displayLabel}
              pulse={
                instance.status === "provisioning" ||
                instance.status === "stopping" ||
                isBooting
              }
            />
            {isBooting && <LoadingSpinner size="small" />}
          </FlexRow>
          {statusHint ? (
            <Caption size="small">{statusHint}</Caption>
          ) : (
            <Caption size="small">{instance.id}</Caption>
          )}
        </FlexColumn>
        <FlexRow gap={3} align="center">
          <Caption size="small">
            Uptime: {formatUptime(instance.created_at, now)}
          </Caption>
          <Caption size="small">
            Cost: {formatCost(instance.estimated_cost_usd)}
          </Caption>
          {isAttached ? (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={`Detach worker ${instance.id}`}
              disabled={busy}
              onClick={onDetach}
            >
              Detach
            </EditorButton>
          ) : isPaused ? (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={`Resume worker ${instance.id}`}
              disabled={stopping}
              onClick={() => onResume(instance.id)}
            >
              Resume
            </EditorButton>
          ) : (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={`Attach worker ${instance.id}`}
              // Only enable once the worker is actually answering — attaching
              // mid-boot just fails the handshake and rolls back.
              disabled={busy || !isRunning || !isHealthy}
              onClick={() => onAttach(instance.id)}
            >
              {isBooting ? "Booting…" : "Attach"}
            </EditorButton>
          )}
          {/* Pause (keep the volume) — only meaningful while the pod runs. */}
          {!isPaused && (
            <EditorButton
              density="compact"
              variant="text"
              aria-label={`Stop worker ${instance.id}`}
              disabled={stopping}
              onClick={() => onStop(instance.id)}
            >
              Stop
            </EditorButton>
          )}
          {/* Destroy the pod + volume. The real teardown. */}
          <EditorButton
            density="compact"
            variant="text"
            aria-label={`Terminate worker ${instance.id}`}
            disabled={stopping}
            onClick={() => onTerminate(instance.id)}
          >
            Terminate
          </EditorButton>
        </FlexRow>
      </FlexRow>
    </Card>
  );
};

// Statuses worth showing in the panel. `stopped` is included now that it means
// "paused, resumable" — the user needs to see it to resume it. `terminated`
// (destroyed) is a tombstone and stays hidden.
const SHOWN_STATUSES: ReadonlySet<string> = new Set([
  "provisioning",
  "running",
  "attached",
  "stopping",
  "stopped"
]);

// Statuses that incur GPU billing (drive the cost total). A paused `stopped`
// pod only bills a little volume storage, so it's excluded here.
const BILLING_STATUSES: ReadonlySet<string> = new Set([
  "provisioning",
  "running",
  "attached",
  "stopping"
]);

interface OrphanWarning {
  count: number;
  liveCount: number;
  estimatedCostUsd: number;
}

const WorkersPanel: React.FC = () => {
  const theme = useTheme();
  const {
    profiles,
    instances,
    instancesQuery,
    apiKeyStatus,
    createProfile,
    deleteProfile,
    provision,
    stop,
    resume,
    terminate,
    stopAll,
    attach,
    detach,
    reconcile
  } = useWorkers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanWarning, setOrphanWarning] = useState<OrphanWarning | null>(null);
  const now = Date.now();

  const shownInstances = useMemo(
    () => instances.filter((instance) => SHOWN_STATUSES.has(instance.status)),
    [instances]
  );

  const totalCost = useMemo(
    () =>
      shownInstances
        .filter((instance) => BILLING_STATUSES.has(instance.status))
        .reduce((sum, instance) => sum + (instance.estimated_cost_usd ?? 0), 0),
    [shownInstances]
  );

  const profileNames = useMemo(
    () => profiles.map((profile) => profile.name),
    [profiles]
  );

  /** Run a lifecycle action, surfacing failures in the error banner. */
  const runAction = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      try {
        await action();
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    []
  );

  const handleProvision = useCallback(
    async (profileName: string) => {
      setIsProvisioning(true);
      const ok = await runAction(() => provision(profileName));
      setIsProvisioning(false);
      if (ok) setDialogOpen(false);
    },
    [provision, runAction]
  );

  const handleStop = useCallback(
    async (id: string) => {
      setStoppingId(id);
      await runAction(() => stop(id));
      setStoppingId(null);
    },
    [stop, runAction]
  );

  const handleResume = useCallback(
    async (id: string) => {
      setStoppingId(id);
      await runAction(() => resume(id));
      setStoppingId(null);
    },
    [resume, runAction]
  );

  const handleTerminate = useCallback(
    async (id: string) => {
      // Destroying the volume loses the cached models — confirm first.
      if (
        !window.confirm(
          "Terminate this worker? Its volume and all cached models are " +
            "permanently deleted. This stops all billing."
        )
      ) {
        return;
      }
      setStoppingId(id);
      await runAction(() => terminate(id));
      setStoppingId(null);
    },
    [terminate, runAction]
  );

  const handleStopAll = useCallback(() => {
    void runAction(() => stopAll());
  }, [stopAll, runAction]);

  const handleAttach = useCallback(
    async (id: string) => {
      setBusy(true);
      await runAction(() => attach(id));
      setBusy(false);
    },
    [attach, runAction]
  );

  const handleDetach = useCallback(async () => {
    setBusy(true);
    await runAction(() => detach());
    setBusy(false);
  }, [detach, runAction]);

  const handleReconcile = useCallback(async () => {
    setBusy(true);
    try {
      const summary = await reconcile();
      setError(null);
      setOrphanWarning(
        summary.orphans.length > 0
          ? {
              count: summary.orphans.length,
              liveCount: summary.liveCount,
              estimatedCostUsd: summary.estimatedCostUsd
            }
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [reconcile]);

  return (
    <FlexColumn gap={0} padding={4} fullHeight css={panelStyles(theme)}>
      <FlexRow
        gap={3}
        align="center"
        justify="space-between"
        className="panel-header"
      >
        <FlexRow gap={2} align="baseline">
          <Text size="big" weight={600}>
            Workers
          </Text>
          {shownInstances.length > 0 && (
            <Caption size="small">{formatRate(totalCost)}</Caption>
          )}
        </FlexRow>
        <FlexRow gap={2} align="center">
          <EditorButton
            density="compact"
            variant="text"
            onClick={() => setProfilesOpen(true)}
            aria-label="Manage profiles"
          >
            Manage Profiles
          </EditorButton>
          <EditorButton
            density="compact"
            variant="outlined"
            onClick={() => setDialogOpen(true)}
            aria-label="Start worker"
          >
            Start Worker
          </EditorButton>
          <EditorButton
            density="compact"
            variant="text"
            onClick={handleReconcile}
            disabled={busy}
            aria-label="Reconcile workers"
          >
            Reconcile
          </EditorButton>
          <EditorButton
            density="compact"
            variant="text"
            onClick={handleStopAll}
            disabled={shownInstances.length === 0}
            aria-label="Stop all workers"
          >
            Stop All
          </EditorButton>
        </FlexRow>
      </FlexRow>

      {error && (
        <AlertBanner
          severity="error"
          compact
          onClose={() => setError(null)}
          sx={{ mt: 2 }}
        >
          {error}
        </AlertBanner>
      )}

      {orphanWarning && (
        <WarningBanner
          variant="warning"
          message={`${orphanWarning.count} orphaned worker(s) may still be billing — stop them in your provider console`}
          description={`${orphanWarning.liveCount} live, ~${formatRate(
            orphanWarning.estimatedCostUsd
          )}`}
          dismissible
          onDismiss={() => setOrphanWarning(null)}
          className="nodrag"
          compact
        />
      )}

      <FlexColumn className="scrollable-content" gap={2} sx={{ mt: 2 }}>
        {instancesQuery.isLoading ? (
          <FlexRow justify="center" sx={{ py: 4 }}>
            <LoadingSpinner size="small" />
          </FlexRow>
        ) : shownInstances.length === 0 ? (
          <Caption size="small">
            No workers running. Start one to rent a GPU for your graphs.
          </Caption>
        ) : (
          shownInstances.map((instance) => (
            <InstanceRow
              key={instance.id}
              instance={instance}
              now={now}
              onStop={handleStop}
              onResume={handleResume}
              onTerminate={handleTerminate}
              onAttach={handleAttach}
              onDetach={handleDetach}
              stopping={stoppingId === instance.id}
              busy={busy}
            />
          ))
        )}
      </FlexColumn>

      <ProvisionDialog
        open={dialogOpen}
        profileNames={profileNames}
        onProvision={handleProvision}
        onClose={() => setDialogOpen(false)}
        isProvisioning={isProvisioning}
      />

      <WorkerProfilesDialog
        open={profilesOpen}
        onClose={() => setProfilesOpen(false)}
        profiles={profiles}
        createProfile={createProfile}
        deleteProfile={deleteProfile}
        apiKeyStatus={apiKeyStatus}
      />
    </FlexColumn>
  );
};

export default memo(WorkersPanel);
