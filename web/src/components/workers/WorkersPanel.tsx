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
  type StatusType
} from "../ui_primitives";
import { useWorkers, type WorkerInstance } from "../../hooks/useWorkers";

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
            No worker profiles yet. Create one with the CLI:{" "}
            <code>nodetool worker profile add</code>.
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
  stopping: boolean;
}

const InstanceRow: React.FC<InstanceRowProps> = ({
  instance,
  now,
  onStop,
  stopping
}) => (
  <Card variant="outlined" padding="normal">
    <FlexRow align="center" justify="space-between" gap={3}>
      <FlexColumn gap={0.5}>
        <FlexRow gap={2} align="center">
          <Text size="normal" weight={600}>
            {instance.profile_name}
          </Text>
          <StatusIndicator
            status={statusTone(instance.status)}
            label={instance.status}
            pulse={
              instance.status === "provisioning" ||
              instance.status === "stopping"
            }
          />
        </FlexRow>
        <Caption size="small">{instance.id}</Caption>
      </FlexColumn>
      <FlexRow gap={3} align="center">
        <Caption size="small">
          Uptime: {formatUptime(instance.created_at, now)}
        </Caption>
        <Caption size="small">
          Cost: {formatCost(instance.estimated_cost_usd)}
        </Caption>
        <EditorButton
          density="compact"
          variant="outlined"
          aria-label={`Stop worker ${instance.id}`}
          disabled={stopping || instance.status === "stopped"}
          onClick={() => onStop(instance.id)}
        >
          Stop
        </EditorButton>
      </FlexRow>
    </FlexRow>
  </Card>
);

const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "provisioning",
  "running",
  "attached",
  "stopping"
]);

const WorkersPanel: React.FC = () => {
  const theme = useTheme();
  const {
    profiles,
    instances,
    instancesQuery,
    provision,
    stop,
    stopAll
  } = useWorkers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const now = Date.now();

  const liveInstances = useMemo(
    () => instances.filter((instance) => LIVE_STATUSES.has(instance.status)),
    [instances]
  );

  const profileNames = useMemo(
    () => profiles.map((profile) => profile.name),
    [profiles]
  );

  const handleProvision = useCallback(
    async (profileName: string) => {
      setIsProvisioning(true);
      try {
        await provision(profileName);
        setDialogOpen(false);
      } finally {
        setIsProvisioning(false);
      }
    },
    [provision]
  );

  const handleStop = useCallback(
    async (id: string) => {
      setStoppingId(id);
      try {
        await stop(id);
      } finally {
        setStoppingId(null);
      }
    },
    [stop]
  );

  const handleStopAll = useCallback(() => {
    void stopAll();
  }, [stopAll]);

  return (
    <FlexColumn gap={0} padding={4} fullHeight css={panelStyles(theme)}>
      <FlexRow
        gap={3}
        align="center"
        justify="space-between"
        className="panel-header"
      >
        <Text size="big" weight={600}>
          Workers
        </Text>
        <FlexRow gap={2} align="center">
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
            onClick={handleStopAll}
            disabled={liveInstances.length === 0}
            aria-label="Stop all workers"
          >
            Stop All
          </EditorButton>
        </FlexRow>
      </FlexRow>

      <FlexColumn className="scrollable-content" gap={2} sx={{ mt: 2 }}>
        {instancesQuery.isLoading ? (
          <FlexRow justify="center" sx={{ py: 4 }}>
            <LoadingSpinner size="small" />
          </FlexRow>
        ) : liveInstances.length === 0 ? (
          <Caption size="small">
            No workers running. Start one to rent a GPU for your graphs.
          </Caption>
        ) : (
          liveInstances.map((instance) => (
            <InstanceRow
              key={instance.id}
              instance={instance}
              now={now}
              onStop={handleStop}
              stopping={stoppingId === instance.id}
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
    </FlexColumn>
  );
};

export default memo(WorkersPanel);
