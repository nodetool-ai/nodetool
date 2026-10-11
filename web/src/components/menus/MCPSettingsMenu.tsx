/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import InstallDesktopIcon from "@mui/icons-material/InstallDesktop";
import {
  Caption,
  CopyButton,
  Text,
  FlexRow,
  FlexColumn,
  NavButton,
  getSpacingPx,
  SPACING
} from "../ui_primitives";
import { getSharedSettingsStyles } from "./settingsMenuStyles";
import { useNotificationStore } from "../../stores/NotificationStore";
import AgentAccessSection from "./AgentAccessSection";
import ExternalMcpServersSection from "./ExternalMcpServersSection";
import { trpcClient } from "../../trpc/client";

interface TargetStatus {
  target: string;
  label: string;
  installed: boolean;
  url: string | null;
  command: string | null;
  configPath: string | null;
}

interface McpStatusResponse {
  targets: TargetStatus[];
  defaultUrl: string;
  defaultLaunch: string;
}

/** Registers the stdio server from any terminal, with no global install. */
const TERMINAL_INSTALL =
  "npx -y --package=@nodetool-ai/cli nodetool mcp install";

type McpTarget = "claude" | "codex" | "opencode";

async function fetchMcpStatus(): Promise<McpStatusResponse> {
  return trpcClient.mcpConfig.status.query();
}

async function installMcp(
  targets: string[]
): Promise<{ results: { target: string; label: string; success: boolean }[] }> {
  return trpcClient.mcpConfig.install.mutate({
    targets: targets as McpTarget[]
  });
}

async function uninstallMcp(
  targets: string[]
): Promise<{ results: { target: string; label: string; removed: boolean }[] }> {
  return trpcClient.mcpConfig.uninstall.mutate({
    targets: targets as McpTarget[]
  });
}

const MCPSettingsMenu = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Installing into a local client config only means something when the
  // server runs on this machine; on a shared host the procedure answers 503.
  // A failure is therefore an answer, not an error to retry or report.
  const { data, isLoading } = useQuery({
    queryKey: ["mcp-status"],
    queryFn: fetchMcpStatus,
    refetchOnWindowFocus: false,
    retry: false
  });

  const installMutation = useMutation({
    mutationFn: installMcp,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-status"] });
      const ok = result.results.filter((r) => r.success);
      if (ok.length > 0) {
        addNotification({
          type: "success",
          alert: true,
          content: `MCP installed for ${ok.map((r) => r.label).join(", ")}`
        });
      }
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: `MCP install failed: ${err}`
      });
    }
  });

  const uninstallMutation = useMutation({
    mutationFn: uninstallMcp,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-status"] });
      const ok = result.results.filter((r) => r.removed);
      if (ok.length > 0) {
        addNotification({
          type: "info",
          alert: true,
          content: `MCP removed from ${ok.map((r) => r.label).join(", ")}`
        });
      }
    }
  });

  const handleInstallAll = useCallback(() => {
    const notInstalled =
      data?.targets.filter((t) => !t.installed).map((t) => t.target) ?? [];
    if (notInstalled.length > 0) {
      installMutation.mutate(notInstalled);
    }
  }, [data, installMutation]);

  const handleInstall = useCallback(
    (target: string) => {
      installMutation.mutate([target]);
    },
    [installMutation]
  );

  const handleUninstall = useCallback(
    (target: string) => {
      uninstallMutation.mutate([target]);
    },
    [uninstallMutation]
  );

  const allInstalled = data?.targets.every((t) => t.installed) ?? false;
  const busy = installMutation.isPending || uninstallMutation.isPending;

  // Claude Desktop installs the bundled `.mcpb` extension, which only the
  // desktop app can hand to the OS. Hidden in the browser/remote UI.
  const installBundle = window.api?.mcp?.installBundle;
  const [bundleBusy, setBundleBusy] = useState(false);

  const handleInstallBundle = useCallback(async () => {
    if (!installBundle) return;
    setBundleBusy(true);
    try {
      const result = await installBundle();
      if (!result.ok) {
        addNotification({
          type: "error",
          alert: true,
          content:
            result.error ?? "Could not find the NodeTool extension bundle."
        });
      } else if (result.opened) {
        addNotification({
          type: "success",
          alert: true,
          content:
            "Opening the NodeTool extension in Claude Desktop — confirm the install there."
        });
      } else {
        addNotification({
          type: "info",
          alert: true,
          content:
            "Revealed nodetool.mcpb — drag it into Claude Desktop → Settings → Extensions."
        });
      }
    } catch (err) {
      addNotification({
        type: "error",
        alert: true,
        content: `Extension install failed: ${err}`
      });
    } finally {
      setBundleBusy(false);
    }
  }, [installBundle, addNotification]);

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          Use NodeTool from Claude Code, Codex, or OpenCode through the{" "}
          <strong>Model Context Protocol</strong>. The agent gets NodeTool
          workflows, media generation, assets, nodes, and collections as tools.
        </Text>

        {isLoading && <Text sx={{ padding: getSpacingPx(SPACING.xl) }}>Loading…</Text>}

        {data && (
          <>
            <div className="settings-section">
              <Text sx={{ fontWeight: 500, mb: 0.5 }}>
                Install on this machine
              </Text>
              <Text className="description" sx={{ mb: 1 }}>
                {data.defaultLaunch.startsWith("http")
                  ? "The client connects to this server. It works while NodeTool runs."
                  : "The client starts NodeTool itself. It works whether or not this app runs."}
              </Text>
              <Text
                className="description"
                sx={{ mb: 1, fontFamily: "var(--fontFamily2)", opacity: 0.6 }}
              >
                {data.defaultLaunch}
              </Text>
              {data.targets.map((t) => (
                <div key={t.target} className="settings-item">
                  <FlexRow align="center" justify="space-between" fullWidth>
                    <FlexRow align="center" gap={1}>
                      {t.installed ? (
                        <CheckCircleIcon
                          sx={{
                            color: theme.palette.success.main,
                            fontSize: "var(--fontSizeBig)"
                          }}
                        />
                      ) : (
                        <CancelIcon
                          sx={{
                            color: theme.palette.text.disabled,
                            fontSize: "var(--fontSizeBig)"
                          }}
                        />
                      )}
                      <FlexColumn gap={0}>
                        <Text sx={{ fontWeight: 500 }}>{t.label}</Text>
                        {t.installed && (t.command ?? t.url) && (
                          <Text
                            className="description"
                            sx={{ fontSize: "var(--fontSizeSmall) !important" }}
                          >
                            {t.command ?? t.url}
                          </Text>
                        )}
                      </FlexColumn>
                    </FlexRow>
                    <FlexRow gap={1}>
                      {t.installed ? (
                        <NavButton
                          icon={<RemoveCircleOutlineIcon />}
                          label="Remove"
                          disabled={busy}
                          onClick={() => handleUninstall(t.target)}
                          navSize="small"
                          sx={{
                            padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`,
                            minWidth: "unset",
                            fontSize: theme.fontSizeSmall
                          }}
                        />
                      ) : (
                        <NavButton
                          icon={<AddCircleOutlineIcon />}
                          label="Install"
                          color="primary"
                          disabled={busy}
                          onClick={() => handleInstall(t.target)}
                          navSize="small"
                          sx={{
                            padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`,
                            minWidth: "unset",
                            fontSize: theme.fontSizeSmall
                          }}
                        />
                      )}
                    </FlexRow>
                  </FlexRow>
                </div>
              ))}
            </div>

            {!allInstalled && (
              <FlexRow justify="flex-start" sx={{ mt: 1 }}>
                <NavButton
                  icon={<InstallDesktopIcon />}
                  label="Install All"
                  color="primary"
                  disabled={busy}
                  onClick={handleInstallAll}
                  sx={{ padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.xxxl)}` }}
                />
              </FlexRow>
            )}
          </>
        )}

        <div
          className="settings-section"
          style={{ marginTop: getSpacingPx(SPACING.xxl) }}
        >
          <Text sx={{ fontWeight: 500, mb: 0.5 }}>Install from a terminal</Text>
          <Text className="description" sx={{ mb: 1 }}>
            Registers NodeTool with every agent harness found on the machine.
            The agent starts NodeTool on demand, so this app does not need to
            run.
          </Text>
          <FlexColumn gap={0.5}>
            <Caption>Run this</Caption>
            <FlexRow align="center" gap={1}>
              <Text
                sx={{
                  flex: 1,
                  fontFamily: "var(--fontFamily2)",
                  fontSize: "var(--fontSizeSmall) !important",
                  wordBreak: "break-all"
                }}
              >
                {TERMINAL_INSTALL}
              </Text>
              <CopyButton value={TERMINAL_INSTALL} tooltip="Copy the command" />
            </FlexRow>
          </FlexColumn>
        </div>

        {installBundle && (
          <div className="settings-section" style={{ marginTop: getSpacingPx(SPACING.xxl) }}>
            <Text sx={{ fontWeight: 500, mb: 0.5 }}>Claude Desktop</Text>
            <Text className="description" sx={{ mb: 1 }}>
              Install the NodeTool extension bundled with this app. Claude
              Desktop opens its install dialog; confirm it there.
            </Text>
            <FlexRow justify="flex-start">
              <NavButton
                icon={<InstallDesktopIcon />}
                label="Install Extension"
                color="primary"
                disabled={bundleBusy}
                onClick={handleInstallBundle}
                sx={{ padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.xxxl)}` }}
              />
            </FlexRow>
          </div>
        )}

        <ExternalMcpServersSection />

        <AgentAccessSection />
      </div>
    </div>
  );
};

export default memo(MCPSettingsMenu);
