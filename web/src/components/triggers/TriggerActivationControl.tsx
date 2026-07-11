/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useRef, useState } from "react";
import BoltIcon from "@mui/icons-material/Bolt";
import { useShallow } from "zustand/react/shallow";

import {
  Box,
  FlexColumn,
  FlexRow,
  Text,
  Chip,
  Divider,
  Tooltip,
  Popover,
  CopyButton,
  LabeledSwitch,
  LoadingSpinner,
  EditorButton,
  EmptyState,
  SPACING,
  getSpacingPx,
  BORDER_RADIUS,
  MOTION,
  cn
} from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { relativeTime } from "../../utils/formatDateAndTime";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  useTriggerStatus,
  useSetTriggersActive,
  useFireTrigger,
  TriggerRegistrationSummary
} from "../../serverState/useTriggers";

const TRIGGER_PREFIX = "nodetool.triggers.";
const WAIT_NODE_TYPE = "nodetool.triggers.Wait";

/** A trigger node is any `nodetool.triggers.*` node except the flow-control Wait. */
const isTriggerNodeType = (type: string | undefined): boolean =>
  typeof type === "string" &&
  type.startsWith(TRIGGER_PREFIX) &&
  type !== WAIT_NODE_TYPE;

const KIND_LABELS: Record<string, string> = {
  webhook: "Webhook",
  schedule: "Schedule",
  file_watch: "File watch",
  manual: "Manual"
};

const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind;

const webhookUrl = (token: string): string => {
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  return `${origin}/api/webhooks/${token}`;
};

const buttonStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    border: "none",
    cursor: "pointer",
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: "transparent",
    color: theme.vars.palette.grey[400],
    transition: `${MOTION.background}, color ${MOTION.fast}`,
    "& svg": { fontSize: "var(--fontSizeBig)" },
    "&:hover": {
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[100]
    },
    "&.active": {
      color: theme.vars.palette.primary.main
    },
    "&.open": {
      backgroundColor: theme.vars.palette.grey[800]
    }
  });

const popoverBody = (theme: Theme) =>
  css({
    padding: getSpacingPx(SPACING.md),
    minWidth: "300px",
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.sm),
    ".trigger-row": {
      padding: getSpacingPx(SPACING.sm),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".trigger-url": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.grey[200],
      wordBreak: "break-all"
    },
    ".trigger-error": {
      color: theme.vars.palette.error.main
    }
  });

interface TriggerRowProps {
  registration: TriggerRegistrationSummary;
  onFire: (registration: TriggerRegistrationSummary) => void;
  firing: boolean;
}

const TriggerRow: React.FC<TriggerRowProps> = memo(function TriggerRow({
  registration,
  onFire,
  firing
}) {
  const fired = registration.last_fired_at
    ? relativeTime(registration.last_fired_at)
    : "never";
  return (
    <FlexColumn gap={1} className="trigger-row">
      <FlexRow align="center" justify="space-between" gap={1}>
        <Chip label={kindLabel(registration.kind)} compact color="primary" />
        <Text size="smaller" color="secondary">
          Last fired: {fired}
        </Text>
      </FlexRow>

      {registration.kind === "webhook" && registration.token && (
        <FlexRow align="center" gap={1}>
          <Text className="trigger-url" title={webhookUrl(registration.token)}>
            {webhookUrl(registration.token)}
          </Text>
          <CopyButton
            value={webhookUrl(registration.token)}
            tooltip="Copy webhook URL"
            buttonSize="small"
          />
        </FlexRow>
      )}

      {registration.last_error && (
        <Text size="smaller" className="trigger-error">
          {registration.last_error}
        </Text>
      )}

      <FlexRow justify="flex-end">
        <EditorButton
          onClick={() => onFire(registration)}
          disabled={firing}
          aria-label={`Fire ${kindLabel(registration.kind)} trigger now`}
        >
          Fire now
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
});

/**
 * Per-workflow trigger activation toggle plus a status popover. Rendered inside
 * the editor's floating toolbar; hides itself when the open graph has no trigger
 * nodes. Activation flips `enabled` on every registration the workflow compiled
 * to; the popover lists each one with its last-fired time, error, webhook URL,
 * and an on-demand "Fire now".
 */
const TriggerActivationControl: React.FC = memo(
  function TriggerActivationControl() {
    const theme = useTheme();
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);

    const { workflowId, hasTriggerNodes } = useNodes(
      useShallow((state) => ({
        workflowId: state.workflow?.id ?? null,
        hasTriggerNodes: state.nodes.some((n) => isTriggerNodeType(n.type))
      }))
    );

    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );

    const { data: registrations } = useTriggerStatus(
      workflowId,
      hasTriggerNodes
    );
    const setActive = useSetTriggersActive(workflowId);
    const fireTrigger = useFireTrigger();

    const active = (registrations?.length ?? 0) > 0;

    const handleToggle = useCallback(
      (next: boolean) => {
        setActive.mutate(next, {
          onError: (error) => {
            addNotification({
              type: "error",
              alert: true,
              content: `Failed to ${
                next ? "activate" : "deactivate"
              } triggers: ${error.message}`
            });
          }
        });
      },
      [setActive, addNotification]
    );

    const handleFire = useCallback(
      (registration: TriggerRegistrationSummary) => {
        fireTrigger.mutate(registration.id, {
          onSuccess: (result) => {
            addNotification({
              type: "success",
              alert: true,
              content: `Trigger fired — job ${result.job_id}`
            });
          },
          onError: (error) => {
            addNotification({
              type: "error",
              alert: true,
              content: `Failed to fire trigger: ${error.message}`
            });
          }
        });
      },
      [fireTrigger, addNotification]
    );

    if (!hasTriggerNodes || !workflowId) {
      return null;
    }

    const tooltip = active
      ? "Triggers active — this workflow runs on incoming events even when the editor is closed. Click for status."
      : "Activate triggers so this workflow runs on incoming events (webhooks, schedules, file changes).";

    return (
      <>
        <Tooltip title={tooltip} placement="top" delay={TOOLTIP_ENTER_DELAY}>
          <button
            ref={anchorRef}
            type="button"
            css={buttonStyles(theme)}
            className={cn(active && "active", open && "open")}
            onClick={() => setOpen(true)}
            aria-label="Trigger activation"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <BoltIcon />
          </button>
        </Tooltip>

        <Popover
          open={open}
          anchorEl={anchorRef.current}
          onClose={() => setOpen(false)}
          placement="top-center"
          maxHeight="60vh"
        >
          <Box css={popoverBody(theme)} role="dialog" aria-label="Triggers">
            <FlexRow align="center" justify="space-between" gap={2}>
              <Text size="small" weight={600}>
                Triggers
              </Text>
              <LabeledSwitch
                label="Active"
                size="small"
                checked={active}
                disabled={setActive.isPending}
                onChange={handleToggle}
              />
            </FlexRow>

            <Divider />

            {setActive.isPending ? (
              <FlexRow justify="center">
                <LoadingSpinner size={20} />
              </FlexRow>
            ) : registrations && registrations.length > 0 ? (
              registrations.map((registration) => (
                <TriggerRow
                  key={registration.id}
                  registration={registration}
                  onFire={handleFire}
                  firing={fireTrigger.isPending}
                />
              ))
            ) : (
              <EmptyState
                title="No active triggers"
                description="Activate to register this workflow's trigger nodes as durable listeners."
              />
            )}
          </Box>
        </Popover>
      </>
    );
  }
);

TriggerActivationControl.displayName = "TriggerActivationControl";

export default TriggerActivationControl;
