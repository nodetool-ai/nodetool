/** @jsxImportSource @emotion/react */
/**
 * Editor toolbar control for arming a workflow's trigger nodes.
 *
 * Renders nothing for a workflow whose graph has no trigger nodes. For a
 * workflow that does, it shows an aggregate Active/Partly active/Inactive
 * toggle plus a per-trigger row (kind, its own enable switch, schedule, last
 * fired, last error, "Fire now") and, for a webhook trigger, its delivery URL
 * and shared secret.
 *
 * Backed by `triggers.listByWorkflow`
 * (`packages/websocket/src/trpc/routers/triggers.ts`), which returns every
 * registration for the workflow — enabled or not — so every trigger node has
 * a discoverable registration id and the toggle can arm a trigger that has
 * never been enabled before.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ErrorBanner from "../support/ErrorBanner";
import {
  Popover,
  ToolbarIconButton,
  LabeledSwitch,
  StatusIndicator,
  FlexColumn,
  FlexRow,
  Text,
  Label,
  Caption,
  Divider,
  EditorButton,
  TextInput,
  CopyButton,
  SPACING,
  BORDER_RADIUS,
  getSpacingPx,
  AlertBanner
} from "../ui_primitives";
import type { StatusType } from "../ui_primitives";
import BoltIcon from "@mui/icons-material/Bolt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useNodes } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  useWorkflowTriggers,
  useSetTriggerEnabled,
  useFireTrigger,
  webhookDeliveryUrl,
  type TriggerRegistrationStatus
} from "../../serverState/useTriggers";
import {
  TRIGGER_KIND_BY_NODE_TYPE,
  describeTriggerDisabledReason,
  isTriggerNodeType
} from "@nodetool-ai/protocol";
import { formatSchedule } from "../../utils/triggerSchedule";

/** Stable empty fallback, so a pending query doesn't hand every render a new
 * array identity and re-create the callbacks that close over it. */
const NO_REGISTRATIONS: readonly TriggerRegistrationStatus[] = [];

interface TriggerNodeSummary {
  nodeId: string;
  kind: string;
}

/** Aggregate of every registration behind the workflow-level switch. */
type ActivationState =
  | "loading"
  | "error"
  | "unregistered"
  | "inactive"
  | "mixed"
  | "active";

const formatLastFired = (iso: string | null, never: string): string => {
  if (!iso) return never;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

/** Text on the workflow-level switch — honest about what we actually know. */
const stateDescriptionKey: Record<ActivationState, string> = {
  loading: "i18n-next5.triggers.descriptions.loading",
  error: "i18n-next5.triggers.descriptions.error",
  unregistered: "i18n-next5.triggers.descriptions.unregistered",
  inactive: "i18n-next5.triggers.descriptions.inactive",
  mixed: "i18n-next5.triggers.descriptions.mixed",
  active: "i18n-next5.triggers.descriptions.active"
};

const stateLabelKey: Record<ActivationState, string> = {
  loading: "i18n-next5.triggers.states.loading",
  error: "i18n-next5.triggers.states.error",
  unregistered: "i18n-next5.triggers.states.unregistered",
  inactive: "i18n-next5.triggers.states.inactive",
  mixed: "i18n-next5.triggers.states.mixed",
  active: "i18n-next5.triggers.states.active"
};

const kindLabelKey: Record<string, string> = {
  webhook: "i18n-next5.triggers.kinds.webhook",
  schedule: "i18n-next5.triggers.kinds.schedule",
  file_watch: "i18n-next5.triggers.kinds.fileWatch",
  manual: "i18n-next5.triggers.kinds.manual"
};

const STATUS_KINDS = {
  loading: "running",
  error: "error",
  unregistered: "default",
  inactive: "default",
  mixed: "warning",
  active: "success"
} satisfies Readonly<Record<ActivationState, StatusType>>;

interface WebhookDeliveryDetailsProps {
  webhookToken: string;
  webhookSecret: string;
}

/** The delivery URL and shared secret a sender needs to POST events. The
 * secret stays masked until the user explicitly reveals it. */
const WebhookDeliveryDetails: React.FC<WebhookDeliveryDetailsProps> = ({
  webhookToken,
  webhookSecret
}) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const url = webhookDeliveryUrl(webhookToken);

  return (
    <FlexColumn gap={SPACING.xs}>
      <FlexRow gap={SPACING.xs} align="center">
        <TextInput
          label={t("i18n-next5.triggers.webhookUrl")}
          hideLabel
          value={url}
          size="small"
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <CopyButton value={url} tooltip={t("i18n-next5.triggers.copyWebhookUrl")} />
      </FlexRow>
      <FlexRow gap={SPACING.xs} align="center">
        <TextInput
          label={t("i18n-next5.triggers.webhookSecret")}
          hideLabel
          type={revealed ? "text" : "password"}
          value={webhookSecret}
          size="small"
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <ToolbarIconButton
          icon={
            revealed ? (
              <VisibilityOffIcon fontSize="small" />
            ) : (
              <VisibilityIcon fontSize="small" />
            )
          }
          tooltip={revealed ? t("i18n-next5.triggers.hideSecret") : t("i18n-next5.triggers.showSecret")}
          ariaLabel={revealed ? t("i18n-next5.triggers.hideWebhookSecret") : t("i18n-next5.triggers.showWebhookSecret")}
          onClick={() => setRevealed((r) => !r)}
        />
        <CopyButton value={webhookSecret} tooltip={t("i18n-next5.triggers.copyWebhookSecret")} />
      </FlexRow>
      <Caption>{t("i18n-next5.triggers.webhookSecretHint")}</Caption>
    </FlexColumn>
  );
};

const TriggerActivationButton: React.FC = () => {
  const { t } = useTranslation();
  const workflowId = useNodes((state) => state.workflow?.id || null);
  // This button sits in the always-mounted floating toolbar, and a node drag
  // pushes a fresh `nodes` array ~60x/s. Collect in one pass rather than
  // filter-then-map, and hand back the previous array whenever the trigger set
  // is unchanged — the common case, since most workflows have none at all. The
  // stable reference also replaces the per-frame deep `isEqual` with identity.
  const triggerNodesSelector = useMemo(() => {
    let lastResult: TriggerNodeSummary[] = [];
    return (state: NodeStoreState) => {
      const next: TriggerNodeSummary[] = [];
      for (const node of state.nodes) {
        if (!isTriggerNodeType(node.type)) continue;
        next.push({
          nodeId: node.id,
          kind: TRIGGER_KIND_BY_NODE_TYPE[node.type as string] ?? "manual"
        });
      }
      if (
        next.length === lastResult.length &&
        next.every(
          (t, i) =>
            t.nodeId === lastResult[i].nodeId && t.kind === lastResult[i].kind
        )
      ) {
        return lastResult;
      }
      lastResult = next;
      return next;
    };
  }, []);
  const triggerNodes = useNodes(triggerNodesSelector);
  const hasTriggerNodes = triggerNodes.length > 0;

  const {
    data: registrations,
    isLoading,
    isError
  } = useWorkflowTriggers(workflowId, { enabled: hasTriggerNodes });
  const rows = registrations ?? NO_REGISTRATIONS;
  const setTriggerEnabled = useSetTriggerEnabled(workflowId);
  const fireTrigger = useFireTrigger(workflowId);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const handleOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    []
  );
  const handleClose = useCallback(() => setAnchorEl(null), []);

  const enabledCount = useMemo(() => rows.filter((r) => r.enabled).length, [rows]);
  const state: ActivationState = isLoading
    ? "loading"
    : isError
      ? "error"
      : rows.length === 0
        ? "unregistered"
        : enabledCount === 0
          ? "inactive"
          : enabledCount === rows.length
            ? "active"
            : "mixed";
  // A trigger the dispatcher gave up on is a failure the user has to see, even
  // though the row now reads as plain "Inactive".
  const hasError = rows.some((r) => r.last_error || r.disabled_reason);
  const canToggle = state !== "loading" && state !== "error" && rows.length > 0;

  const handleToggle = useCallback(
    async (nextActive: boolean) => {
      // Sequential, not a parallel fan-out: each call invalidates the same
      // query key, and a failure part-way through must not stop the rest.
      for (const reg of rows.filter((r) => r.enabled !== nextActive)) {
        try {
          await setTriggerEnabled.mutateAsync({
            id: reg.id,
            enabled: nextActive
          });
        } catch {
          // The mutation's onError already told the user. Keep going so one
          // rejected registration doesn't strand the others.
        }
      }
    },
    [rows, setTriggerEnabled]
  );

  const handleRowToggle = useCallback(
    (registrationId: string, nextEnabled: boolean) => {
      setTriggerEnabled.mutate({ id: registrationId, enabled: nextEnabled });
    },
    [setTriggerEnabled]
  );

  const handleFire = useCallback(
    (registrationId: string) => {
      fireTrigger.mutate({ registrationId });
    },
    [fireTrigger]
  );

  if (!hasTriggerNodes) {
    return null;
  }

  const buttonState = rows.some((r) => r.disabled_reason)
    ? t("i18n-next5.triggers.buttonStateDisabled", { state: t(stateLabelKey[state]).toLowerCase() })
    : hasError && (state === "active" || state === "mixed")
      ? t("i18n-next5.triggers.buttonStateFailed", { state: t(stateLabelKey[state]).toLowerCase() })
      : t(stateLabelKey[state]).toLowerCase();
  const buttonLabel = t("i18n-next5.triggers.buttonLabel", { state: buttonState });

  return (
    <>
      <ToolbarIconButton
        icon={<BoltIcon />}
        tooltip={buttonLabel}
        onClick={handleOpen}
        active={state === "active" || state === "mixed"}
        variant={hasError || state === "error" ? "error" : "default"}
        ariaLabel={buttonLabel}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorEl)}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        placement="bottom-right"
      >
        <FlexColumn
          gap={SPACING.lg}
          padding={SPACING.xl}
          sx={{
            // Full 360px on a desktop toolbar; inset by one panel gutter on a
            // phone, where the popover would otherwise overflow the viewport.
            width: `min(360px, calc(100vw - ${getSpacingPx(SPACING.xxxl)}))`
          }}
          role="region"
          aria-label={t("i18n-next5.triggers.regionLabel")}
        >
          <FlexRow justify="space-between" align="center">
            <Text size="big">{t("i18n-next5.triggers.title")}</Text>
            <StatusIndicator
              status={STATUS_KINDS[state]}
              label={t(stateLabelKey[state])}
              size="small"
            />
          </FlexRow>

          <LabeledSwitch
            label={t("i18n-next5.triggers.workflowActive")}
            description={t(stateDescriptionKey[state])}
            checked={state === "active"}
            onChange={(next) => {
              void handleToggle(next);
            }}
            disabled={!canToggle}
            id="trigger-activation-switch"
          />

          <Divider />

          <FlexColumn gap={SPACING.md}>
            {triggerNodes.map(({ nodeId, kind }) => {
              const reg: TriggerRegistrationStatus | undefined = rows.find(
                (r) => r.node_id === nodeId
              );
              const schedule =
                kind === "schedule"
                  ? formatSchedule(reg?.interval_seconds, reg?.next_fire_at)
                  : null;
              const stoppedBecause = describeTriggerDisabledReason(
                reg?.disabled_reason,
                reg?.consecutive_failures
              );
              return (
                <FlexColumn
                  key={nodeId}
                  gap={SPACING.xs}
                  role="group"
                  aria-label={t("i18n-next5.triggers.groupLabel", { kind: kindLabelKey[kind] ? t(kindLabelKey[kind]) : kind, id: nodeId })}
                  sx={{
                    borderRadius: BORDER_RADIUS.md,
                    padding: SPACING.md
                  }}
                >
                  <FlexRow justify="space-between" align="center">
                    <Label>{kindLabelKey[kind] ? t(kindLabelKey[kind]) : kind}</Label>
                    <StatusIndicator
                      status={
                        reg?.enabled
                          ? "success"
                          : stoppedBecause
                            ? "error"
                            : "pending"
                      }
                      label={
                        reg?.enabled
                          ? t("i18n-next5.triggers.states.active")
                          : stoppedBecause
                            ? t("i18n-next5.triggers.stopped")
                            : t("i18n-next5.triggers.states.inactive")
                      }
                      size="small"
                    />
                  </FlexRow>
                  <LabeledSwitch
                    size="small"
                    label={t("i18n-next5.triggers.enabled")}
                    checked={Boolean(reg?.enabled)}
                    disabled={!reg}
                    onChange={(next) => reg && handleRowToggle(reg.id, next)}
                    id={`trigger-enabled-${nodeId}`}
                  />
                  {isLoading && <Caption>{t("i18n-next5.triggers.checkingStatus")}</Caption>}
                  {isError && (
                    <ErrorBanner
                      report={{
                        source: "operation-failure",
                        summary: t("i18n-next5.triggers.loadFailed")
                      }}
                    >
                      {t("i18n-next5.triggers.loadFailed")}
                    </ErrorBanner>
                  )}
                  {schedule && <Caption>{schedule}</Caption>}
                  {!isLoading && !isError && (
                    <Caption>
                      {t("i18n-next5.triggers.lastFired", { date: formatLastFired(reg?.last_fired_at ?? null, t("i18n-next5.triggers.never")) })}
                    </Caption>
                  )}
                  {stoppedBecause && (
                    <AlertBanner severity="warning" compact>
                      {t("i18n-next5.triggers.stoppedRetry", { reason: stoppedBecause })}
                    </AlertBanner>
                  )}
                  {reg?.last_error && (
                    <ErrorBanner
                      report={{
                        source: "operation-failure",
                        summary: t("i18n-next5.triggers.runFailed"),
                        errorText: reg.last_error
                      }}
                    >
                      {t("i18n-next5.triggers.lastError", { error: reg.last_error })}
                    </ErrorBanner>
                  )}
                  {kind === "webhook" &&
                    reg?.webhook_token &&
                    reg?.webhook_secret && (
                      <WebhookDeliveryDetails
                        webhookToken={reg.webhook_token}
                        webhookSecret={reg.webhook_secret}
                      />
                    )}
                  <FlexRow justify="flex-end">
                    <EditorButton
                      size="small"
                      disabled={!reg?.enabled}
                      loading={fireTrigger.isPending}
                      onClick={() => reg && handleFire(reg.id)}
                    >
                      {t("i18n-next5.triggers.fireNow")}
                    </EditorButton>
                  </FlexRow>
                </FlexColumn>
              );
            })}
          </FlexColumn>
        </FlexColumn>
      </Popover>
    </>
  );
};

export default TriggerActivationButton;
