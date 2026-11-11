/**
 * Connect the ComfyUI on the user's own computer and see that the app reached
 * it: the address field, the server's version, GPU and model counts, and a
 * "Start a Comfy workflow" button on one of its checkpoints.
 *
 * UX research study 18: ComfyUI users looked for their ComfyUI where AI
 * providers connect (I1), could not tell whether a saved address worked (I2),
 * and found no way from a connected ComfyUI to making something (I3).
 */
import { memo, useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useQueryClient } from "@tanstack/react-query";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";

import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useComfyServerStatus } from "../../serverState/useComfyServerStatus";
import { refreshComfyNodeCatalog } from "../../serverState/useComfyNodeMetadata";
import { useStartComfyWorkflow } from "../../hooks/useStartComfyWorkflow";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { pickStarterCheckpoint } from "../../lib/comfy/comfyStarterGraph";
import {
  COMFY_SERVER_STATUS_KEY,
  describeComfyModels,
  describeComfyServer
} from "../../lib/comfy/comfyServerStatus";

export const COMFY_DEFAULT_ADDRESS = "http://127.0.0.1:8188";

interface ComfyServerStatusLineProps {
  /** Called once "Start a Comfy workflow" has opened the new workflow. */
  onStarted?: () => void;
}

/**
 * The saved ComfyUI's answer: what it is and which models it has, or why it
 * did not answer. Renders nothing while no address is saved.
 */
export const ComfyServerStatusLine: React.FC<ComfyServerStatusLineProps> = memo(
  function ComfyServerStatusLine({ onStarted }) {
    const theme = useTheme();
    const { data, error, isFetching, refetch, serverUrl } = useComfyServerStatus();
    const target = useRemoteSettingsStore((s) => s.getSettingValue("COMFY_TARGET") ?? "");
    const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
    const { start, starting } = useStartComfyWorkflow(onStarted);

    const checkpoint = data ? pickStarterCheckpoint(data.models.checkpoints ?? []) : undefined;

    const handleStart = useCallback(async () => {
      // This button promises a workflow on this ComfyUI, so it selects it.
      if (target !== "server") {
        await updateSettings({ COMFY_TARGET: "server" }).catch(() => undefined);
        await refreshComfyNodeCatalog().catch(() => undefined);
      }
      await start(checkpoint);
    }, [checkpoint, start, target, updateSettings]);

    if (!serverUrl) {
      return null;
    }
    if (isFetching && !data && !error) {
      return (
        <Caption role="status" aria-live="polite">
          Checking ComfyUI at {serverUrl}…
        </Caption>
      );
    }
    if (error) {
      return (
        <FlexRow role="status" aria-live="polite" gap={SPACING.sm} align="flex-start">
          <ErrorOutlineRoundedIcon
            sx={{ fontSize: "1.2em", color: theme.vars.palette.error.main, mt: SPACING.micro }}
          />
          <FlexColumn gap={SPACING.xs} sx={{ flex: "1 1 auto", minWidth: 0 }}>
            <Caption color="error">{error.message}</Caption>
            <EditorButton
              density="compact"
              size="small"
              variant="text"
              loading={isFetching}
              onClick={() => void refetch()}
              sx={{ alignSelf: "flex-start" }}
            >
              Check again
            </EditorButton>
          </FlexColumn>
        </FlexRow>
      );
    }
    if (!data) {
      return null;
    }
    const models = describeComfyModels(data);
    return (
      <FlexRow role="status" aria-live="polite" gap={SPACING.sm} align="flex-start" wrap>
        <CheckCircleRoundedIcon
          sx={{ fontSize: "1.2em", color: theme.vars.palette.success.main, mt: SPACING.micro }}
        />
        <FlexColumn gap={SPACING.micro} sx={{ flex: "1 1 200px", minWidth: 0 }}>
          <Text size="small">Connected to {describeComfyServer(data)}</Text>
          {models && <Caption>{models}</Caption>}
          {!checkpoint && data.models.checkpoints && (
            <Caption>
              Put a checkpoint in ComfyUI&apos;s models/checkpoints folder to start a workflow here.
            </Caption>
          )}
        </FlexColumn>
        <EditorButton
          size="small"
          variant="outlined"
          disabled={!checkpoint}
          loading={starting}
          onClick={() => void handleStart()}
          sx={{ whiteSpace: "nowrap" }}
        >
          Start a Comfy workflow
        </EditorButton>
      </FlexRow>
    );
  }
);

interface LocalComfyConnectProps {
  /** Called once "Start a Comfy workflow" has opened the new workflow. */
  onStarted?: () => void;
}

/**
 * The "ComfyUI on this computer" row: an address, a Connect button that saves
 * it and selects the server as the Comfy target, and the server's answer.
 */
const LocalComfyConnect: React.FC<LocalComfyConnectProps> = ({ onStarted }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const savedUrl = useRemoteSettingsStore((s) => s.getSettingValue("COMFY_SERVER_URL") ?? "");
  const fetchSettings = useRemoteSettingsStore((s) => s.fetchSettings);
  const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [draft, setDraft] = useState(savedUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSettings().catch(() => {
      // The field stays empty, and Connect reports a save error.
    });
  }, [fetchSettings]);

  useEffect(() => {
    setDraft(savedUrl);
  }, [savedUrl]);

  const connect = useCallback(async () => {
    const url = (draft.trim() || COMFY_DEFAULT_ADDRESS).replace(/\/+$/, "");
    setSaving(true);
    try {
      await updateSettings({ COMFY_SERVER_URL: url, COMFY_TARGET: "server" });
      // The same address saved again still checks the server again.
      await queryClient.invalidateQueries({ queryKey: [COMFY_SERVER_STATUS_KEY] });
      await refreshComfyNodeCatalog().catch(() => undefined);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `The ComfyUI address could not be saved: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    } finally {
      setSaving(false);
    }
  }, [addNotification, draft, queryClient, updateSettings]);

  return (
    <FlexColumn
      component="article"
      aria-label="ComfyUI on this computer"
      gap={SPACING.md}
      sx={{ p: SPACING.xl, backgroundColor: theme.vars.palette.background.paper }}
    >
      <FlexRow align="center" gap={SPACING.lg}>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: 42,
            height: 42,
            minWidth: 42,
            borderRadius: BORDER_RADIUS.lg,
            backgroundColor: theme.vars.palette.background.default
          }}
        >
          <HubOutlinedIcon sx={{ color: theme.vars.palette.text.secondary }} />
        </FlexRow>
        <FlexColumn gap={SPACING.micro} sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <Text>ComfyUI on this computer</Text>
          <Caption size="small" sx={{ lineHeight: 1.5 }}>
            Run your own checkpoints and LoRAs on the ComfyUI you already have. No account or key.
          </Caption>
        </FlexColumn>
      </FlexRow>
      <FlexRow
        gap={SPACING.sm}
        align="flex-end"
        onKeyDown={(event: React.KeyboardEvent) => event.stopPropagation()}
      >
        <TextInput
          compact
          label="ComfyUI address"
          placeholder={COMFY_DEFAULT_ADDRESS}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void connect();
            }
          }}
        />
        <EditorButton
          variant="contained"
          loading={saving}
          onClick={() => void connect()}
          sx={{ whiteSpace: "nowrap" }}
        >
          Connect
        </EditorButton>
      </FlexRow>
      <ComfyServerStatusLine onStarted={onStarted} />
    </FlexColumn>
  );
};

export default memo(LocalComfyConnect);
