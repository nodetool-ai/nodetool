/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
  SPACING,
  LoadingSpinner,
  ICON_SIZE
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
  const { t } = useTranslation();
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
          content: t("screens4_4.mcp.installed", { labels: ok.map((r) => r.label).join(", ") })
        });
      }
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_4.mcp.installFailed", { error: String(err) })
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
          content: t("screens4_4.mcp.removed", { labels: ok.map((r) => r.label).join(", ") })
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
            result.error ?? t("screens4_4.mcp.bundleNotFound")
        });
      } else if (result.opened) {
        addNotification({
          type: "success",
          alert: true,
          content:
            t("screens4_4.mcp.openingBundle")
        });
      } else {
        addNotification({
          type: "info",
          alert: true,
          content:
            t("screens4_4.mcp.bundleRevealed")
        });
      }
    } catch (err) {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_4.mcp.extensionInstallFailed", { error: String(err) })
      });
    } finally {
      setBundleBusy(false);
    }
  }, [installBundle, addNotification, t]);

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          {t("screens4_4.mcp.descriptionLead")}{" "}
          <strong>{t("screens4_4.mcp.modelContextProtocol")}</strong>{t("screens4_4.mcp.descriptionTail")}
        </Text>

        {isLoading && (
          <LoadingSpinner
            size="small"
            text={t("screens4_4.mcp.loading")}
          />
        )}

        {data && (
          <>
            <div className="settings-section">
              <Text sx={{ fontWeight: 500, mb: 0.5 }}>
                {t("screens4_4.mcp.installOnMachine")}
              </Text>
              <Text className="description" sx={{ mb: 1 }}>
                {data.defaultLaunch.startsWith("http")
                  ? t("screens4_4.mcp.connectToServer")
                  : t("screens4_4.mcp.startNodeTool")}
              </Text>
              <Text
                className="description"
                sx={{ mb: 1, fontFamily: "var(--fontFamily2)", opacity: 0.6 }}
              >
                {data.defaultLaunch}
              </Text>
              {data.targets.map((target) => (
                <div key={target.target} className="settings-item">
                  <FlexRow align="center" justify="space-between" fullWidth>
                    <FlexRow align="center" gap={1}>
                      {target.installed ? (
                        <CheckCircleIcon
                          sx={{
                            color: theme.vars.palette.success.main,
                            fontSize: ICON_SIZE.md
                          }}
                        />
                      ) : (
                        <CancelIcon
                          sx={{
                            color: theme.vars.palette.text.disabled,
                            fontSize: ICON_SIZE.md
                          }}
                        />
                      )}
                      <FlexColumn gap={0}>
                        <Text sx={{ fontWeight: 500 }}>{target.label}</Text>
                        {target.installed && (target.command ?? target.url) && (
                          <Text
                            className="description"
                            sx={{ fontSize: "var(--fontSizeSmall) !important" }}
                          >
                            {target.command ?? target.url}
                          </Text>
                        )}
                      </FlexColumn>
                    </FlexRow>
                    <FlexRow gap={1}>
                      {target.installed ? (
                        <NavButton
                          icon={<RemoveCircleOutlineIcon />}
                          label={t("screens4_4.mcp.remove")}
                          disabled={busy}
                          onClick={() => handleUninstall(target.target)}
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
                          label={t("screens4_4.mcp.install")}
                          color="primary"
                          disabled={busy}
                          onClick={() => handleInstall(target.target)}
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
                  label={t("screens4_4.mcp.installAll")}
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
          <Text sx={{ fontWeight: 500, mb: 0.5 }}>{t("screens4_4.mcp.installFromTerminal")}</Text>
          <Text className="description" sx={{ mb: 1 }}>
            {t("screens4_4.mcp.terminalDescription")}
          </Text>
          <FlexColumn gap={0.5}>
            <Caption>{t("screens4_4.mcp.runThis")}</Caption>
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
              <CopyButton value={TERMINAL_INSTALL} tooltip={t("screens4_4.mcp.copyCommand")} />
            </FlexRow>
          </FlexColumn>
        </div>

        {installBundle && (
          <div className="settings-section" style={{ marginTop: getSpacingPx(SPACING.xxl) }}>
            <Text sx={{ fontWeight: 500, mb: 0.5 }}>{t("screens4_4.mcp.claudeDesktop")}</Text>
            <Text className="description" sx={{ mb: 1 }}>
              {t("screens4_4.mcp.claudeDesktopDescription")}
            </Text>
            <FlexRow justify="flex-start">
              <NavButton
                icon={<InstallDesktopIcon />}
                label={t("screens4_4.mcp.installExtension")}
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
