/** @jsxImportSource @emotion/react */
/**
 * Editor toolbar control for arming a workflow's trigger nodes.
 *
 * Renders nothing for a workflow whose graph has no trigger nodes. For a
 * workflow that does, it shows an Active/Inactive toggle plus a per-trigger
 * status row (kind, last fired, last error, "Fire now") and, for a webhook
 * trigger, its delivery URL and shared secret.
 *
 * Backed by `triggers.listByWorkflow`
 * (`packages/websocket/src/trpc/routers/triggers.ts`), which returns every
 * registration for the workflow — enabled or not — so every trigger node has
 * a discoverable registration id and the toggle can arm a trigger that has
 * never been enabled before.
 */
import React, { useCallback, useState } from "react";
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
  BORDER_RADIUS
} from "../ui_primitives";
import BoltIcon from "@mui/icons-material/Bolt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useNodes } from "../../contexts/NodeContext";
import {
  useWorkflowTriggers,
  useSetTriggerEnabled,
  useFireTrigger,
  webhookDeliveryUrl,
  type TriggerRegistrationStatus
} from "../../serverState/useTriggers";
import {
  TRIGGER_KIND_BY_NODE_TYPE,
  isTriggerNodeType
} from "../../utils/triggerNodeTypes";

interface TriggerNodeSummary {
  nodeId: string;
  kind: string;
}

const formatLastFired = (iso: string | null): string => {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

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
  const [revealed, setRevealed] = useState(false);
  const url = webhookDeliveryUrl(webhookToken);

  return (
    <FlexColumn gap={SPACING.xs}>
      <FlexRow gap={SPACING.xs} align="center">
        <TextInput
          label="Webhook URL"
          hideLabel
          value={url}
          size="small"
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <CopyButton value={url} tooltip="Copy webhook URL" />
      </FlexRow>
      <FlexRow gap={SPACING.xs} align="center">
        <TextInput
          label="Webhook secret"
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
          tooltip={revealed ? "Hide secret" : "Show secret"}
          ariaLabel={revealed ? "Hide webhook secret" : "Show webhook secret"}
          onClick={() => setRevealed((r) => !r)}
        />
        <CopyButton value={webhookSecret} tooltip="Copy webhook secret" />
      </FlexRow>
      <Caption>Send this value as the x-webhook-secret header.</Caption>
    </FlexColumn>
  );
};

const TriggerActivationButton: React.FC = () => {
  const workflowId = useNodes((state) => state.workflow?.id || null);
  const triggerNodes = useNodes(
    (state): TriggerNodeSummary[] =>
      state.nodes
        .filter((n) => isTriggerNodeType(n.type))
        .map((n) => ({
          nodeId: n.id,
          kind: TRIGGER_KIND_BY_NODE_TYPE[n.type as string] ?? "manual"
        }))
  );
  const hasTriggerNodes = triggerNodes.length > 0;

  const { data: registrations = [] } = useWorkflowTriggers(workflowId, {
    enabled: hasTriggerNodes
  });
  const setTriggerEnabled = useSetTriggerEnabled(workflowId);
  const fireTrigger = useFireTrigger(workflowId);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const handleOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    []
  );
  const handleClose = useCallback(() => setAnchorEl(null), []);

  const isActive = registrations.some((r) => r.enabled);
  const canToggle = registrations.length > 0;

  const handleToggle = useCallback(
    (nextActive: boolean) => {
      for (const reg of registrations) {
        if (reg.enabled !== nextActive) {
          setTriggerEnabled.mutate({ id: reg.id, enabled: nextActive });
        }
      }
    },
    [registrations, setTriggerEnabled]
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

  return (
    <>
      <ToolbarIconButton
        className="composer-action"
        icon={<BoltIcon />}
        tooltip={isActive ? "Trigger active" : "Trigger inactive"}
        onClick={handleOpen}
        ariaLabel="Trigger status"
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
          sx={{ width: "360px" }}
          role="region"
          aria-label="Trigger status"
        >
          <FlexRow justify="space-between" align="center">
            <Text size="big">Triggers</Text>
            <StatusIndicator
              status={isActive ? "success" : "default"}
              label={isActive ? "Active" : "Inactive"}
              size="small"
            />
          </FlexRow>

          <LabeledSwitch
            label="Workflow active"
            description={
              canToggle
                ? "Listens for events and starts a run per event."
                : "Save the workflow first — activation needs a saved trigger registration."
            }
            checked={isActive}
            onChange={handleToggle}
            disabled={!canToggle}
            id="trigger-activation-switch"
          />

          <Divider />

          <FlexColumn gap={SPACING.md}>
            {triggerNodes.map(({ nodeId, kind }) => {
              const reg: TriggerRegistrationStatus | undefined =
                registrations.find((r) => r.node_id === nodeId);
              return (
                <FlexColumn
                  key={nodeId}
                  gap={SPACING.xs}
                  sx={{
                    borderRadius: BORDER_RADIUS.md,
                    padding: SPACING.md
                  }}
                >
                  <FlexRow justify="space-between" align="center">
                    <Label>{kind}</Label>
                    <StatusIndicator
                      status={reg?.enabled ? "success" : "pending"}
                      label={reg?.enabled ? "Active" : "Inactive"}
                      size="small"
                    />
                  </FlexRow>
                  <Caption>Last fired: {formatLastFired(reg?.last_fired_at ?? null)}</Caption>
                  {reg?.last_error && (
                    <Caption color="error">Last error: {reg.last_error}</Caption>
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
                      disabled={!reg?.enabled || fireTrigger.isPending}
                      onClick={() => reg && handleFire(reg.id)}
                    >
                      Fire now
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
