/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { css } from "@emotion/react";
import {
  FlexColumn,
  FlexRow,
  Card,
  Text,
  Caption,
  LoadingSpinner,
  EditorButton,
  ConfirmDialog,
  Dialog,
  SelectField,
  StatusIndicator,
  AlertBanner,
  PanelHeader,
  type StatusType, getSpacingPx, SPACING,
  EmptyState
} from "../ui_primitives";
import {
  useWorkers,
  useWorkerHealth,
  type WorkerInstance,
  type WorkerProfile,
  type WorkerTarget
} from "../../hooks/useWorkers";
import WorkerProfilesDialog from "./WorkerProfilesDialog";
import WorkerApiKeySetup from "./WorkerApiKeySetup";

/**
 * Workers panel — the live GPU-worker surface. Lists provisioned instances with
 * their status, uptime, and estimated cost; lets the user provision a new worker
 * from a profile; and surfaces real teardown (Stop / Stop All) because GPU pods
 * bill continuously.
 */

const STATUS_TONE: Record<string, StatusType> = {
  provisioning: "running",
  running: "info",
  attached: "success",
  stopping: "running",
  stopped: "default",
  error: "error"
};

const panelStyles =
  css({
    "&": {
      height: "100%"
    },
    ".workers-body": {
      flex: 1,
      minHeight: 0,
      padding: getSpacingPx(SPACING.lg)
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    }
  });

function formatUptime(
  createdAt: string,
  now: number,
  locale: string,
  t: TFunction
): string {
  const startedMs = Date.parse(createdAt);
  if (Number.isNaN(startedMs)) return t("screens4_8.workers.common.unavailable");
  const seconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const numberFormat = new Intl.NumberFormat(locale);
  if (seconds < 60) {
    return t("screens4_8.workers.uptime.seconds", {
      count: seconds,
      value: numberFormat.format(seconds)
    });
  }
  if (seconds < 3600) {
    const value = Math.floor(seconds / 60);
    return t("screens4_8.workers.uptime.minutes", {
      count: value,
      value: numberFormat.format(value)
    });
  }
  if (seconds < 86400) {
    const value = Math.floor(seconds / 3600);
    return t("screens4_8.workers.uptime.hours", {
      count: value,
      value: numberFormat.format(value)
    });
  }
  const value = Math.floor(seconds / 86400);
  return t("screens4_8.workers.uptime.days", {
    count: value,
    value: numberFormat.format(value)
  });
}

function formatCost(cost: number | null, locale: string, t: TFunction): string {
  if (cost === null) return t("screens4_8.workers.common.unavailable");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cost);
}

function formatRate(cost: number, locale: string, t: TFunction): string {
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cost);
  return t("screens4_8.workers.rate", { amount });
}

function statusTone(status: string): StatusType {
  return STATUS_TONE[status] ?? "default";
}

interface ProvisionDialogProps {
  open: boolean;
  profiles: WorkerProfile[];
  apiKeyStatus?: Record<WorkerTarget, boolean>;
  onProvision: (profileName: string) => void;
  onClose: () => void;
  isProvisioning: boolean;
}

const ProvisionDialog: React.FC<ProvisionDialogProps> = ({
  open,
  profiles,
  apiKeyStatus,
  onProvision,
  onClose,
  isProvisioning
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>(profiles[0]?.name ?? "");
  const profile =
    profiles.find((candidate) => candidate.name === selected) ?? profiles[0];
  const effective = profile?.name ?? "";
  // Provisioning without the provider key fails at the provider. Ask for it
  // here instead of after the click.
  const apiKeyMissing =
    profile !== undefined && apiKeyStatus?.[profile.target] === false;

  const options = useMemo(
    () => profiles.map(({ name }) => ({ value: name, label: name })),
    [profiles]
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
      title={t("screens4_8.workers.provision.title")}
      maxWidth="xs"
      fullWidth
      onConfirm={handleProvision}
      confirmText={t("screens4_8.workers.provision.confirm")}
      confirmDisabled={!effective || apiKeyMissing}
      isLoading={isProvisioning}
    >
      <FlexColumn gap={SPACING.md}>
        <SelectField
          label={t("screens4_8.workers.provision.profileLabel")}
          value={effective}
          onChange={setSelected}
          options={options}
        />
        {profile && apiKeyMissing && (
          <WorkerApiKeySetup target={profile.target} />
        )}
        {profile && (
          <Caption size="small">
            {profile.idle_timeout_minutes
              ? t("screens4_8.workers.provision.idleSummary", {
                  count: profile.idle_timeout_minutes
                })
              : t("screens4_8.workers.provision.noIdleSummary")}
          </Caption>
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
  /** Started from this panel: attach on its own once the worker answers. */
  autoAttach: boolean;
  onAutoAttach: (id: string) => void;
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
  busy,
  autoAttach,
  onAutoAttach
}) => {
  const { t, i18n } = useTranslation();
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
  const displayLabelKey = isRunning
    ? isHealthy
      ? "ready"
      : "booting"
    : instance.status;
  const displayLabel = t(`screens4_8.workers.status.${displayLabelKey}`);
  const displayTone: StatusType = isRunning
    ? isHealthy
      ? "success"
      : "running"
    : statusTone(instance.status);
  const statusHint =
    instance.status === "provisioning"
      ? t("screens4_8.workers.status.provisioningHint")
      : isBooting
        ? autoAttach
          ? t("screens4_8.workers.status.bootingAutoAttachHint")
          : t("screens4_8.workers.status.bootingHint")
        : isRunning && isHealthy
          ? autoAttach
            ? t("screens4_8.workers.status.attachingHint")
            : t("screens4_8.workers.status.readyHint")
          : null;

  // A worker started here attaches the moment it answers, so the user does not
  // have to come back and press Attach.
  useEffect(() => {
    if (autoAttach && isRunning && isHealthy && !busy) {
      onAutoAttach(instance.id);
    }
  }, [autoAttach, isRunning, isHealthy, busy, onAutoAttach, instance.id]);

  return (
    <Card variant="outlined" padding="normal">
      <FlexRow align="center" justify="space-between" gap={SPACING.lg}>
        <FlexColumn gap={SPACING.micro}>
          <FlexRow gap={SPACING.md} align="center">
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
        <FlexRow gap={SPACING.lg} align="center">
          <Caption size="small">
            {t("screens4_8.workers.instance.uptime", {
              value: formatUptime(instance.created_at, now, i18n.language, t)
            })}
          </Caption>
          <Caption size="small">
            {t("screens4_8.workers.instance.cost", {
              value: formatCost(instance.estimated_cost_usd, i18n.language, t)
            })}
          </Caption>
          {isAttached ? (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={t("screens4_8.workers.instance.detachAria", { id: instance.id })}
              disabled={busy}
              onClick={onDetach}
            >
              {t("screens4_8.workers.instance.detach")}
            </EditorButton>
          ) : isPaused ? (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={t("screens4_8.workers.instance.resumeAria", { id: instance.id })}
              disabled={stopping}
              onClick={() => onResume(instance.id)}
            >
              {t("screens4_8.workers.instance.resume")}
            </EditorButton>
          ) : (
            <EditorButton
              density="compact"
              variant="outlined"
              aria-label={t("screens4_8.workers.instance.attachAria", { id: instance.id })}
              // Only enable once the worker is actually answering — attaching
              // mid-boot just fails the handshake and rolls back.
              disabled={busy || !isRunning || !isHealthy}
              onClick={() => onAttach(instance.id)}
            >
              {isBooting
                ? t("screens4_8.workers.status.bootingEllipsis")
                : t("screens4_8.workers.instance.attach")}
            </EditorButton>
          )}
          {/* Pause (keep the volume) — only meaningful while the pod runs. */}
          {!isPaused && (
            <EditorButton
              density="compact"
              variant="text"
              aria-label={t("screens4_8.workers.instance.stopAria", { id: instance.id })}
              disabled={stopping}
              onClick={() => onStop(instance.id)}
            >
              {t("screens4_8.workers.instance.stop")}
            </EditorButton>
          )}
          {/* Destroy the pod + volume. The real teardown. */}
          <EditorButton
            density="compact"
            variant="text"
            aria-label={t("screens4_8.workers.instance.terminateAria", { id: instance.id })}
            disabled={stopping}
            onClick={() => onTerminate(instance.id)}
          >
            {t("screens4_8.workers.instance.terminate")}
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
  const { t, i18n } = useTranslation();
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
  const [terminateTargetId, setTerminateTargetId] = useState<string | null>(
    null
  );
  // Workers started from this panel that should attach once ready.
  const [autoAttachIds, setAutoAttachIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
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

  const hasProfiles = profiles.length > 0;
  const hasAttached = instances.some(
    (instance) => instance.status === "attached"
  );

  /** Run a lifecycle action, surfacing failures in the error banner. */
  const runAction = useCallback(
    async <T,>(action: () => Promise<T>): Promise<boolean> => {
      try {
        await action();
        setError(null);
        return true;
      } catch (err) {
        setError(t("screens4_8.workers.errors.action", {
          message: err instanceof Error ? err.message : String(err)
        }));
        return false;
      }
    },
    [t]
  );

  /** Rent a worker and mark it to attach once it answers. Throws on failure. */
  const startWorker = useCallback(
    async (profileName: string): Promise<void> => {
      const instance = await provision(profileName);
      setAutoAttachIds((ids) => new Set(ids).add(instance.id));
    },
    [provision]
  );

  const handleProvision = useCallback(
    async (profileName: string) => {
      setIsProvisioning(true);
      const ok = await runAction(() => startWorker(profileName));
      setIsProvisioning(false);
      if (ok) setDialogOpen(false);
    },
    [startWorker, runAction]
  );

  // With no profile yet, "Start worker" opens the setup form instead of a
  // picker with nothing in it.
  const openStart = useCallback(() => {
    if (hasProfiles) {
      setDialogOpen(true);
    } else {
      setProfilesOpen(true);
    }
  }, [hasProfiles]);

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

  // Destroying the volume loses the cached models — confirm first.
  const handleTerminate = useCallback((id: string) => {
    setTerminateTargetId(id);
  }, []);

  const closeTerminateConfirm = useCallback(() => {
    setTerminateTargetId(null);
  }, []);

  const handleConfirmTerminate = useCallback(() => {
    const id = terminateTargetId;
    if (id === null) return;
    void (async () => {
      setStoppingId(id);
      await runAction(() => terminate(id));
      setStoppingId(null);
    })();
  }, [terminateTargetId, terminate, runAction]);

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

  const handleAutoAttach = useCallback(
    (id: string) => {
      setAutoAttachIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      // Never take over a worker the user attached in the meantime.
      if (!hasAttached) {
        void handleAttach(id);
      }
    },
    [hasAttached, handleAttach]
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
      setError(t("screens4_8.workers.errors.reconcile", {
        message: err instanceof Error ? err.message : String(err)
      }));
    } finally {
      setBusy(false);
    }
  }, [reconcile, t]);

  return (
    <FlexColumn gap={0} fullHeight css={panelStyles}>
      <PanelHeader
        title={t("screens4_8.workers.panelTitle")}
        count={
          shownInstances.length > 0
            ? formatRate(totalCost, i18n.language, t)
            : undefined
        }
        actions={
          <>
            <EditorButton
              density="compact"
              variant="text"
              onClick={() => setProfilesOpen(true)}
              aria-label={t("screens4_8.workers.actions.manageProfiles")}
            >
              {t("screens4_8.workers.actions.manageProfiles")}
            </EditorButton>
            <EditorButton
              density="compact"
              variant="outlined"
              onClick={openStart}
              aria-label={t("screens4_8.workers.actions.startWorker")}
            >
              {t("screens4_8.workers.actions.startWorker")}
            </EditorButton>
            <EditorButton
              density="compact"
              variant="text"
              onClick={handleReconcile}
              disabled={busy}
              aria-label={t("screens4_8.workers.actions.reconcile")}
            >
              {t("screens4_8.workers.actions.reconcile")}
            </EditorButton>
            <EditorButton
              density="compact"
              variant="text"
              onClick={handleStopAll}
              disabled={shownInstances.length === 0}
              aria-label={t("screens4_8.workers.actions.stopAll")}
            >
              {t("screens4_8.workers.actions.stopAll")}
            </EditorButton>
          </>
        }
      />
      <FlexColumn className="workers-body" gap={0}>
        {error && (
          <AlertBanner
            severity="error"
            compact
            onClose={() => setError(null)}
            sx={{ mt: SPACING.md }}
          >
            {error}
          </AlertBanner>
        )}

        {orphanWarning && (
          <AlertBanner
            severity="warning"
            title={t("screens4_8.workers.orphanWarning.title", { count: orphanWarning.count })}
            onClose={() => setOrphanWarning(null)}
            className="nodrag"
            compact
          >
            {t("screens4_8.workers.orphanWarning.details", {
              count: orphanWarning.liveCount,
              rate: formatRate(orphanWarning.estimatedCostUsd, i18n.language, t)
            })}
          </AlertBanner>
        )}

        <FlexColumn
          className="scrollable-content"
          gap={SPACING.md}
          sx={{ mt: SPACING.md }}
        >
          {instancesQuery.isLoading ? (
            <FlexRow justify="center" sx={{ py: SPACING.xl }}>
              <LoadingSpinner size="small" />
            </FlexRow>
          ) : shownInstances.length === 0 ? (
            hasProfiles ? (
              <EmptyState
                size="small"
                title={t("screens4_8.workers.empty.title")}
                description={t("screens4_8.workers.empty.description")}
                actionText={t("screens4_8.workers.empty.start")}
                onAction={openStart}
              />
            ) : (
              <EmptyState
                size="small"
                title={t("screens4_8.workers.setup.title")}
                description={t("screens4_8.workers.setup.description")}
                actionText={t("screens4_8.workers.setup.action")}
                onAction={openStart}
              />
            )
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
                autoAttach={autoAttachIds.has(instance.id)}
                onAutoAttach={handleAutoAttach}
              />
            ))
          )}
        </FlexColumn>
      </FlexColumn>

      <ProvisionDialog
        open={dialogOpen}
        profiles={profiles}
        apiKeyStatus={apiKeyStatus}
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
        onStart={startWorker}
      />

      <ConfirmDialog
        open={terminateTargetId !== null}
        onClose={closeTerminateConfirm}
        onConfirm={handleConfirmTerminate}
        title={t("screens4_8.workers.terminate.title")}
        content={t("screens4_8.workers.terminate.description")}
        confirmText={t("screens4_8.workers.instance.terminate")}
        cancelText={t("screens4_8.workers.common.cancel")}
        destructive
      />
    </FlexColumn>
  );
};

export default memo(WorkersPanel);
