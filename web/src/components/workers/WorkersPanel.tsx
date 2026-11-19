/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { css } from "@emotion/react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DeveloperBoardIcon from "@mui/icons-material/DeveloperBoard";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  FlexColumn,
  FlexRow,
  Card,
  Chip,
  Text,
  Caption,
  LoadingSpinner,
  CopyButton,
  EditorButton,
  ConfirmDialog,
  Dialog,
  SelectField,
  StatusIndicator,
  AlertBanner,
  PanelHeader,
  type StatusType, getSpacingPx, SPACING, BORDER_RADIUS,
  EmptyState,
  SectionHeader,
  EditorMenu,
  MenuItemPrimitive,
  ToolbarIconButton,
  Tooltip,
  TruncatedText
} from "../ui_primitives";
import {
  useWorkers,
  useWorkerHealth,
  type ComfyPreset,
  type GpuAvailability,
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

const TARGET_LABEL: Record<WorkerTarget, string> = {
  runpod: "RunPod",
  vast: "Vast.ai",
  verda: "Verda"
};

function readStringField(
  spec: Record<string, unknown> | undefined,
  key: string
): string | null {
  const val = spec?.[key];
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

function readNumberField(
  spec: Record<string, unknown> | undefined,
  key: string
): number | null {
  const val = spec?.[key];
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

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
      overflowY: "auto",
      overflowX: "hidden",
      padding: getSpacingPx(SPACING.lg)
    },
    ".workers-presets": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: getSpacingPx(SPACING.md)
    },
    ".workers-table": {
      border: "1px solid var(--palette-divider)",
      borderRadius: BORDER_RADIUS.md,
      overflow: "hidden"
    },
    ".workers-row": {
      display: "grid",
      gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) auto",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
      borderTop: "1px solid var(--palette-divider)"
    },
    ".workers-head": {
      borderTop: "none",
      paddingTop: getSpacingPx(SPACING.sm),
      paddingBottom: getSpacingPx(SPACING.sm)
    },
    ".scrollable-content": {
      flexShrink: 0
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

function formatTimer(createdAt: string, now: number): string | null {
  const startedMs = Date.parse(createdAt);
  if (Number.isNaN(startedMs)) return null;
  const totalSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatRunningCost(
  hourlyRate: number | null,
  createdAt: string,
  now: number,
  locale: string
): string | null {
  if (hourlyRate === null) return null;
  const startedMs = Date.parse(createdAt);
  if (Number.isNaN(startedMs)) return null;
  const elapsedHours = Math.max(0, (now - startedMs) / 3_600_000);
  const accrued = hourlyRate * elapsedHours;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: accrued < 0.1 ? 4 : 2
  }).format(accrued);
}

function formatCost(cost: number | null, locale: string, t: TFunction): string {
  if (cost === null) return t("screens4_8.workers.common.unavailable");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cost);
}

function formatRate(cost: number, locale: string, t: TFunction): string {
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cost);
  return t("screens4_8.workers.rate", { amount });
}

type StockLevel = "high" | "medium" | "low" | "none";

const STOCK_RANK: Record<StockLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** The better stock level of the two RunPod cloud tiers. */
function stockLevel(entry: GpuAvailability | undefined): StockLevel {
  const levels = [entry?.secure, entry?.community].map(
    (value): StockLevel => (value ? (value.toLowerCase() as StockLevel) : "none")
  );
  return levels.reduce((best, level) =>
    STOCK_RANK[level] > STOCK_RANK[best] ? level : best
  );
}

const STOCK_COLOR: Record<StockLevel, "success" | "warning" | "error"> = {
  high: "success",
  medium: "success",
  low: "warning",
  none: "error"
};

interface GpuStockProps {
  gpuId: string;
  availability: GpuAvailability[];
}

/** A GPU name with its RunPod stock level. Renders the bare id while loading. */
const GpuStock: React.FC<GpuStockProps> = ({ gpuId, availability }) => {
  const { t } = useTranslation();
  const entry = availability.find((candidate) => candidate.id === gpuId);
  if (availability.length === 0) {
    return <Caption size="small">{gpuId}</Caption>;
  }
  const level = stockLevel(entry);
  return (
    <FlexRow gap={SPACING.sm} align="center" justify="space-between">
      <Caption size="small">{entry?.displayName ?? gpuId}</Caption>
      <Chip
        compact
        color={STOCK_COLOR[level]}
        label={t(`screens4_8.workers.stock.${level}`)}
      />
    </FlexRow>
  );
};

function statusTone(status: string): StatusType {
  return STATUS_TONE[status] ?? "default";
}

interface ProvisionDialogProps {
  open: boolean;
  profiles: WorkerProfile[];
  availability: GpuAvailability[];
  apiKeyStatus?: Record<WorkerTarget, boolean>;
  onProvision: (profileName: string) => void;
  onClose: () => void;
  isProvisioning: boolean;
}

const ProvisionDialog: React.FC<ProvisionDialogProps> = ({
  open,
  profiles,
  availability,
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

  const profileGpu =
    profile?.target === "runpod"
      ? readStringField(profile.spec as Record<string, unknown> | undefined, "gpu")
      : null;

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
        {profileGpu && (
          <GpuStock gpuId={profileGpu} availability={availability} />
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

interface ComfyPresetsSectionProps {
  presets: ComfyPreset[];
  availability: GpuAvailability[];
  runningProfiles: ReadonlySet<string>;
  startingId: string | null;
  apiKeyMissing: boolean;
  onStart: (presetId: string) => void;
}

const ComfyPresetsSection: React.FC<ComfyPresetsSectionProps> = ({
  presets,
  availability,
  runningProfiles,
  startingId,
  apiKeyMissing,
  onStart
}) => {
  const { t, i18n } = useTranslation();
  const money = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "USD"
  });
  if (presets.length === 0) return null;
  const lifetimeHours = Math.round(presets[0].maxLifetimeMinutes / 60);
  return (
    <FlexColumn gap={SPACING.sm} sx={{ mt: SPACING.xl }}>
      <SectionHeader
        title={t("screens4_8.workers.presets.sectionTitle")}
        subtitle={t("screens4_8.workers.presets.sectionSubtitle", {
          count: lifetimeHours
        })}
        size="small"
      />
      {apiKeyMissing && <WorkerApiKeySetup target="runpod" />}
      <div className="workers-presets">
        {presets.map((preset) => {
          const running = runningProfiles.has(preset.profileName);
          return (
            <Card key={preset.id} variant="outlined" padding="normal">
              <FlexColumn gap={SPACING.sm} fullHeight>
                <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
                  <Text size="normal" weight={600}>
                    {preset.label}
                  </Text>
                  <Caption size="small" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {t("screens4_8.workers.presets.priceRange", {
                      min: money.format(preset.hourlyUsd.min),
                      max: money.format(preset.hourlyUsd.max)
                    })}
                  </Caption>
                </FlexRow>
                <FlexColumn gap={SPACING.xs} sx={{ flex: 1 }}>
                  {preset.gpus.map((gpu) => (
                    <GpuStock key={gpu} gpuId={gpu} availability={availability} />
                  ))}
                </FlexColumn>
                <EditorButton
                  density="compact"
                  variant="outlined"
                  aria-label={t("screens4_8.workers.presets.startAria", {
                    name: preset.label
                  })}
                  disabled={apiKeyMissing || startingId !== null || running}
                  onClick={() => onStart(preset.id)}
                >
                  {running
                    ? t("screens4_8.workers.presets.running")
                    : startingId === preset.id
                      ? t("screens4_8.workers.presets.starting")
                      : t("screens4_8.workers.presets.start")}
                </EditorButton>
              </FlexColumn>
            </Card>
          );
        })}
      </div>
    </FlexColumn>
  );
};

interface InstanceRowProps {
  instance: WorkerInstance;
  profile?: WorkerProfile;
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
  profile,
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
  const isBilling = BILLING_STATUSES.has(instance.status);
  const timerText = isBilling ? formatTimer(instance.created_at, now) : null;
  const runningCostText = isBilling
    ? formatRunningCost(
        instance.estimated_cost_usd,
        instance.created_at,
        now,
        i18n.language
      )
    : null;

  // While a worker is `running` but not attached, "running" only means the
  // pod's port is mapped — not that the worker process is serving. Probe its
  // real readiness so the user knows when it's safe to attach.
  const healthQuery = useWorkerHealth(instance.id, isRunning);
  const isHealthy = healthQuery.data?.healthy === true;
  const isBooting = isRunning && !isHealthy;
  // A ComfyUI pod has no worker bridge to attach. Its URL goes in the node.
  const comfyEndpoint = healthQuery.data?.comfyEndpoint;
  const profileSpec = profile?.spec as Record<string, unknown> | undefined;
  const isComfy =
    Boolean(comfyEndpoint) || readNumberField(profileSpec, "comfyPort") !== null;
  const gpu = readStringField(profileSpec, "gpu");
  const gpuCount = readNumberField(profileSpec, "gpuCount");
  const vcpu = readNumberField(profileSpec, "vcpu");
  const disk = readNumberField(profileSpec, "disk");
  const region = readStringField(profileSpec, "region");
  const endpointUrl = comfyEndpoint ?? instance.ws_url;
  const healthError = !isHealthy ? healthQuery.data?.error : undefined;
  const protocolVersion = healthQuery.data?.protocolVersion;

  const hardwareParts: string[] = [];
  if (gpu) {
    hardwareParts.push(gpuCount && gpuCount > 1 ? `${gpu} ×${gpuCount}` : gpu);
  }
  if (vcpu) hardwareParts.push(`${vcpu} vCPU`);
  if (disk) hardwareParts.push(`${disk} GB disk`);
  if (region) hardwareParts.push(region);

  const metaParts: string[] = [
    `Provider ID: ${instance.provider_ref}`,
    `Instance ID: ${instance.id}`
  ];
  if (instance.last_activity_at) {
    metaParts.push(
      `Last activity: ${formatUptime(instance.last_activity_at, now, i18n.language, t)} ago`
    );
  }
  if (instance.attached_to) {
    metaParts.push(`Attached: ${instance.attached_to}`);
  }
  if (protocolVersion !== undefined) {
    metaParts.push(`Protocol: v${protocolVersion}`);
  }
  if (profile?.idle_timeout_minutes) {
    metaParts.push(`Idle stop: ${profile.idle_timeout_minutes}m`);
  }
  if (profile?.max_lifetime_minutes) {
    metaParts.push(`Max lifetime: ${profile.max_lifetime_minutes}m`);
  }

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
      : comfyEndpoint && isRunning
        ? isHealthy
          ? t("screens4_8.workers.presets.readyHint")
          : t("screens4_8.workers.presets.bootingHint")
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
    if (autoAttach && isRunning && isHealthy && !busy && !comfyEndpoint) {
      onAutoAttach(instance.id);
    }
  }, [autoAttach, isRunning, isHealthy, busy, comfyEndpoint, onAutoAttach, instance.id]);

  const [menuButton, setMenuButton] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const runMenu = useCallback(
    (action: () => void) => () => {
      setMenuOpen(false);
      action();
    },
    []
  );

  const hourlyText =
    instance.estimated_cost_usd !== null
      ? formatRate(instance.estimated_cost_usd, i18n.language, t)
      : t("screens4_8.workers.common.unavailable");
  const statusIcon = isPaused ? (
    <PauseIcon fontSize="small" />
  ) : isBooting ||
    instance.status === "provisioning" ||
    instance.status === "stopping" ? (
    <LoadingSpinner size="small" />
  ) : (
    <PlayArrowIcon fontSize="small" color="success" />
  );

  const primaryAction = comfyEndpoint ? (
    isRunning &&
    isHealthy && (
      <CopyButton
        value={comfyEndpoint}
        tooltip={t("screens4_8.workers.presets.copyEndpoint")}
      />
    )
  ) : isAttached ? (
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
  );

  const detailsTooltip = (
    <FlexColumn gap={SPACING.micro}>
      <Caption size="small">{displayLabel}</Caption>
      {hardwareParts.length > 0 && (
        <Caption size="small">{hardwareParts.join(" · ")}</Caption>
      )}
      {profile?.image && <Caption size="small">Image: {profile.image}</Caption>}
      {endpointUrl && <Caption size="small">Endpoint: {endpointUrl}</Caption>}
      {metaParts.map((part) => (
        <Caption key={part} size="small">
          {part}
        </Caption>
      ))}
    </FlexColumn>
  );

  return (
    <div className="workers-row" role="row">
      <FlexColumn gap={SPACING.micro} role="cell" sx={{ minWidth: 0 }}>
        <Tooltip title={detailsTooltip}>
          <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
            {statusIcon}
            <TruncatedText variant="body2" sx={{ fontWeight: 500 }}>
              {instance.profile_name}
            </TruncatedText>
            {isComfy && (
              <Chip compact label={t("screens4_8.workers.presets.badge")} />
            )}
          </FlexRow>
        </Tooltip>
        <Caption size="small">
          <span css={{ fontFamily: "var(--fontFamily2)" }}>{instance.provider_ref}</span>
          {` · ${displayLabel}`}
        </Caption>
        {statusHint && <Caption size="small">{statusHint}</Caption>}
        {healthError && (
          <Caption size="small" sx={{ color: "error.main" }}>
            {healthError}
          </Caption>
        )}
      </FlexColumn>
      <FlexColumn gap={SPACING.micro} role="cell">
        <FlexRow gap={SPACING.xs} align="center">
          <DeveloperBoardIcon fontSize="small" />
          <Text size="normal">
            {gpu ?? (vcpu ? `${vcpu} vCPU` : t("screens4_8.workers.instance.gpuUnknown"))}
          </Text>
          {gpu && (
            <Caption size="small" sx={{ fontFamily: "var(--fontFamily2)" }}>
              x{gpuCount ?? 1}
            </Caption>
          )}
        </FlexRow>
        <Caption size="small">{TARGET_LABEL[instance.target]}</Caption>
      </FlexColumn>
      <FlexColumn gap={SPACING.micro} role="cell">
        <Text size="normal" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {hourlyText}
        </Text>
        <Caption size="small" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {runningCostText && timerText
            ? `${runningCostText} · ${timerText}`
            : isPaused
              ? t("screens4_8.workers.instance.pausedCost")
              : t("screens4_8.workers.instance.uptime", {
                value: formatUptime(instance.created_at, now, i18n.language, t)
              })}
        </Caption>
      </FlexColumn>
      <FlexRow gap={SPACING.xs} align="center" justify="flex-end" role="cell">
        {primaryAction}
        <ToolbarIconButton
          ref={setMenuButton}
          icon={<MoreVertIcon fontSize="small" />}
          tooltip={t("screens4_8.workers.instance.moreActions")}
          ariaLabel={t("screens4_8.workers.instance.moreActions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        />
        <EditorMenu
          anchorEl={menuButton}
          open={menuOpen}
          onClose={closeMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          {!isPaused && (
            <MenuItemPrimitive
              label={t("screens4_8.workers.instance.stop")}
              icon={<PauseIcon fontSize="small" />}
              disabled={stopping}
              onClick={runMenu(() => onStop(instance.id))}
            />
          )}
          <MenuItemPrimitive
            label={t("screens4_8.workers.instance.copyId")}
            icon={<ContentCopyIcon fontSize="small" />}
            onClick={runMenu(() => {
              void navigator.clipboard.writeText(instance.provider_ref);
            })}
          />
          <MenuItemPrimitive
            label={t("screens4_8.workers.instance.terminate")}
            icon={<DeleteOutlineIcon fontSize="small" />}
            disabled={stopping}
            onClick={runMenu(() => onTerminate(instance.id))}
          />
        </EditorMenu>
      </FlexRow>
    </div>
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
    comfyPresets,
    gpuAvailability,
    startComfyPreset,
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
  const [startingPresetId, setStartingPresetId] = useState<string | null>(null);
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
  const [now, setNow] = useState(() => Date.now());

  const shownInstances = useMemo(
    () => instances.filter((instance) => SHOWN_STATUSES.has(instance.status)),
    [instances]
  );

  const hasLiveBilling = useMemo(
    () =>
      shownInstances.some((instance) => BILLING_STATUSES.has(instance.status)),
    [shownInstances]
  );

  useEffect(() => {
    if (!hasLiveBilling) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasLiveBilling]);

  const totalCost = useMemo(
    () =>
      shownInstances
        .filter((instance) => BILLING_STATUSES.has(instance.status))
        .reduce((sum, instance) => sum + (instance.estimated_cost_usd ?? 0), 0),
    [shownInstances]
  );

  const runningProfiles = useMemo(
    () => new Set(shownInstances.map((instance) => instance.profile_name)),
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

  const handleStartPreset = useCallback(
    async (presetId: string) => {
      setStartingPresetId(presetId);
      await runAction(() => startComfyPreset(presetId));
      setStartingPresetId(null);
    },
    [startComfyPreset, runAction]
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
          gap={SPACING.sm}
          sx={{ mt: SPACING.md }}
        >
          <SectionHeader
            title={t("screens4_8.workers.list.title")}
            subtitle={t("screens4_8.workers.list.subtitle")}
            size="small"
          />
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
            <div className="workers-table" role="table">
            <div className="workers-row workers-head" role="row">
              <Caption size="small" role="columnheader">Name</Caption>
              <Caption size="small" role="columnheader">Compute type</Caption>
              <Caption size="small" role="columnheader">Cost</Caption>
              <span role="columnheader" />
            </div>
            {shownInstances.map((instance) => (
              <InstanceRow
                key={instance.id}
                instance={instance}
                profile={profiles.find((p) => p.name === instance.profile_name)}
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
            ))}
            </div>
          )}
        </FlexColumn>
        <ComfyPresetsSection
          presets={comfyPresets}
          availability={gpuAvailability}
          runningProfiles={runningProfiles}
          startingId={startingPresetId}
          apiKeyMissing={apiKeyStatus?.runpod === false}
          onStart={handleStartPreset}
        />
      </FlexColumn>

      <ProvisionDialog
        open={dialogOpen}
        profiles={profiles}
        availability={gpuAvailability}
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
