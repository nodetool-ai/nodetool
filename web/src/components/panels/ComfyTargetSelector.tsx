/**
 * Shows and changes where Comfy workflows run. The target is global, so this
 * control writes settings. It renders only in a Comfy workflow.
 */
import React, { memo, useCallback, useEffect, useState } from "react";
import { COMFY_RUN_MODE } from "@nodetool-ai/protocol";

import { useNodes } from "../../contexts/NodeContext";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkers, type WorkerInstance } from "../../hooks/useWorkers";
import { reloadComfyNodeCatalog } from "../../serverState/useComfyNodeMetadata";
import { trpcClient } from "../../trpc/client";
import {
  EditorButton,
  EditorMenu,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  TextInput
} from "../ui_primitives";

const hostOf = (url: string): string => {
  try {
    return new URL(/:\/\//.test(url) ? url : `http://${url}`).host;
  } catch {
    return url;
  }
};

/** The target's label. An unset target follows the legacy server-first rule. */
export const comfyTargetLabel = (
  target: string | undefined,
  serverUrl: string | undefined,
  workerUrl: string | undefined
): string => {
  const kind = target || (serverUrl ? "server" : "cloud");
  if (kind === "server") {
    return serverUrl ? `Server: ${hostOf(serverUrl)}` : "Server: not set";
  }
  if (kind === "worker") {
    return workerUrl ? `Worker: ${hostOf(workerUrl)}` : "Worker: not set";
  }
  return "Comfy Cloud";
};

const ComfyTargetSelector: React.FC = memo(function ComfyTargetSelector() {
  const isComfy = useNodes(
    (state) => state.workflow?.run_mode === COMFY_RUN_MODE
  );
  return isComfy ? <TargetMenu /> : null;
});

const TargetMenu: React.FC = () => {
  const target = useRemoteSettingsStore((s) => s.getSettingValue("COMFY_TARGET"));
  const serverUrl = useRemoteSettingsStore((s) =>
    s.getSettingValue("COMFY_SERVER_URL")
  );
  const workerUrl = useRemoteSettingsStore((s) =>
    s.getSettingValue("COMFY_WORKER_URL")
  );
  const fetchSettings = useRemoteSettingsStore((s) => s.fetchSettings);
  const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { instances } = useWorkers();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draftUrl, setDraftUrl] = useState("");

  useEffect(() => {
    void fetchSettings().catch(() => {
      // The label falls back to the unset rule, and a save reports its error.
    });
  }, [fetchSettings]);

  const kind = target || (serverUrl ? "server" : "cloud");
  const running = instances.filter(
    (i) => i.status === "running" || i.status === "attached"
  );

  const apply = useCallback(
    async (
      settings: Record<string, string>,
      secrets: Record<string, string> = {}
    ) => {
      setAnchor(null);
      const notifyError = (prefix: string, error: unknown): void => {
        addNotification({
          type: "error",
          alert: true,
          content: `${prefix}: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      };
      try {
        await updateSettings(settings, secrets);
      } catch (error) {
        notifyError("The Comfy target could not change", error);
        return;
      }
      try {
        await reloadComfyNodeCatalog();
      } catch (error) {
        notifyError("The Comfy target changed, but its nodes could not load", error);
      }
    },
    [updateSettings, addNotification]
  );

  // A Comfy preset pod has no worker bridge, so it is a server with a URL.
  const selectInstance = useCallback(
    async (instance: WorkerInstance) => {
      const health = await trpcClient.worker.health
        .query({ id: instance.id })
        .catch(() => null);
      if (health?.comfyEndpoint) {
        if (!health.healthy) {
          setAnchor(null);
          addNotification({
            type: "warning",
            alert: true,
            content: `${instance.profile_name} is running, but ComfyUI is not ready yet. The target did not change. Try again when ComfyUI has started.`
          });
          return;
        }
        await apply({
          COMFY_TARGET: "server",
          COMFY_SERVER_URL: health.comfyEndpoint
        });
        return;
      }
      await apply(
        { COMFY_TARGET: "worker", COMFY_WORKER_URL: instance.ws_url },
        { COMFY_WORKER_TOKEN: instance.token ?? "" }
      );
    },
    [apply, addNotification]
  );

  const saveServer = useCallback(() => {
    const url = draftUrl.trim();
    if (url) {
      void apply({ COMFY_TARGET: "server", COMFY_SERVER_URL: url });
    }
  }, [apply, draftUrl]);

  return (
    <>
      <EditorButton
        size="small"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        title="Where this Comfy workflow runs"
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          setDraftUrl(serverUrl ?? "");
          setAnchor(event.currentTarget);
        }}
      >
        {comfyTargetLabel(target, serverUrl, workerUrl)}
      </EditorButton>
      <EditorMenu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        paperSx={{ minWidth: 300 }}
      >
        <MenuItemPrimitive
          label="Comfy Cloud"
          secondary="Comfy's GPUs, with your COMFY_API_KEY"
          checkable="radio"
          checked={kind === "cloud"}
          onClick={() => void apply({ COMFY_TARGET: "cloud" })}
        />
        {running.map((instance) => (
          <MenuItemPrimitive
            key={instance.id}
            label={`Worker: ${instance.profile_name}`}
            secondary={hostOf(instance.ws_url)}
            checkable="radio"
            checked={kind === "worker" && workerUrl === instance.ws_url}
            onClick={() => void selectInstance(instance)}
          />
        ))}
        <MenuItemPrimitive
          label="ComfyUI server"
          secondary={serverUrl ? hostOf(serverUrl) : "Enter a URL below"}
          checkable="radio"
          checked={kind === "server"}
          disabled={!draftUrl.trim()}
          onClick={saveServer}
          dividerBefore
        />
        <FlexRow
          gap={SPACING.sm}
          sx={{ px: SPACING.md, py: SPACING.sm }}
          onKeyDown={(event: React.KeyboardEvent) => event.stopPropagation()}
        >
          <TextInput
            compact
            label="ComfyUI server URL"
            hideLabel
            placeholder="http://127.0.0.1:8188"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveServer();
            }}
          />
          <EditorButton size="small" disabled={!draftUrl.trim()} onClick={saveServer}>
            Use
          </EditorButton>
        </FlexRow>
      </EditorMenu>
    </>
  );
};

export default ComfyTargetSelector;
