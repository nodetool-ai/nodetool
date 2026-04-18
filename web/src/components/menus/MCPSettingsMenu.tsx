/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import InstallDesktopIcon from "@mui/icons-material/InstallDesktop";
import { Text, FlexRow, FlexColumn, NavButton } from "../ui_primitives";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

interface TargetStatus {
  target: string;
  label: string;
  installed: boolean;
  url: string | null;
  configPath: string | null;
}

interface McpStatusResponse {
  targets: TargetStatus[];
  defaultUrl: string;
}

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

  const { data, isLoading } = useQuery({
    queryKey: ["mcp-status"],
    queryFn: fetchMcpStatus,
    refetchOnWindowFocus: false
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
  const anyInstalled = data?.targets.some((t) => t.installed) ?? false;
  const busy = installMutation.isPending || uninstallMutation.isPending;

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          Connect AI coding assistants to NodeTool via the{" "}
          <strong>Model Context Protocol</strong>. When installed, Claude Code,
          Codex, and OpenCode can use NodeTool workflows, assets, nodes, and
          collections as tools.
        </Text>

        {data?.defaultUrl && (
          <Text
            className="description"
            sx={{ mb: 2, fontFamily: "monospace", opacity: 0.6 }}
          >
            Server URL: {data.defaultUrl}
          </Text>
        )}

        {isLoading && <Text sx={{ padding: "1em" }}>Loading...</Text>}

        {data && (
          <>
            <div className="settings-section">
              {data.targets.map((t) => (
                <div key={t.target} className="settings-item">
                  <FlexRow align="center" justify="space-between" fullWidth>
                    <FlexRow align="center" gap={1}>
                      {t.installed ? (
                        <CheckCircleIcon
                          sx={{
                            color: theme.palette.success.main,
                            fontSize: "1.2rem"
                          }}
                        />
                      ) : (
                        <CancelIcon
                          sx={{
                            color: theme.palette.text.disabled,
                            fontSize: "1.2rem"
                          }}
                        />
                      )}
                      <FlexColumn gap={0}>
                        <Text sx={{ fontWeight: 500 }}>{t.label}</Text>
                        {t.installed && t.url && (
                          <Text
                            className="description"
                            sx={{ fontSize: "0.75rem !important" }}
                          >
                            {t.url}
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
                            padding: "0.25em 1em",
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
                            padding: "0.25em 1em",
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
                  sx={{ padding: "0.4em 2em" }}
                />
              </FlexRow>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default memo(MCPSettingsMenu);
