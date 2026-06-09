/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import { Text, FlexRow, FlexColumn, NavButton, Chip } from "../ui_primitives";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { BASE_URL } from "../../stores/BASE_URL";

const CHROME_EXTENSIONS_URL = "chrome://extensions";

async function fetchExtensionStatus() {
  return trpcClient.extension.status.query();
}

async function copyText(text: string): Promise<void> {
  if (window.api?.clipboard?.writeText) {
    await window.api.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

const STEPS: readonly string[] = [
  "Download the extension (or use the build folder below).",
  "Open chrome://extensions in the Chrome you use for the target sites.",
  "Enable “Developer mode” (top-right).",
  "Click “Load unpacked” and select the extension folder.",
  "Open a site to automate, click the Nodetool extension, and press “Attach to this tab”."
];

const BrowserExtensionSettingsMenu = () => {
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { data, isLoading } = useQuery({
    queryKey: ["extension-status"],
    queryFn: fetchExtensionStatus,
    refetchInterval: 3000,
    refetchOnWindowFocus: true
  });

  const connected = data?.connected ?? false;
  const distPath = data?.distPath ?? "";
  const distExists = data?.distExists ?? false;
  const canReveal = Boolean(distExists && window.api?.showItemInFolder);
  const downloadUrl = `${BASE_URL}/api/extension/download`;

  const handleReveal = useCallback(() => {
    if (distPath && window.api?.showItemInFolder) {
      void window.api.showItemInFolder(distPath);
    }
  }, [distPath]);

  const handleCopy = useCallback(
    async (text: string, what: string) => {
      try {
        await copyText(text);
        addNotification({
          type: "success",
          alert: true,
          content: `Copied ${what}`
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not copy ${what}`
        });
      }
    },
    [addNotification]
  );

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          The <strong>Nodetool browser extension</strong> lets the{" "}
          <strong>Live Browser Agent</strong> drive your own logged-in Chrome —
          automating media-generation sites, saving results as assets, and
          uploading assets into pages. Chrome can’t install it for you, so load
          it unpacked once with the steps below.
        </Text>

        <FlexRow gap={1} sx={{ alignItems: "center", mb: 1 }}>
          <Chip
            icon={
              connected ? (
                <CheckCircleIcon fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" />
              )
            }
            label={
              isLoading
                ? "Checking…"
                : connected
                  ? "Extension connected"
                  : "Not connected"
            }
            color={connected ? "success" : "default"}
          />
          {!connected && !isLoading && (
            <Text size="small" sx={{ opacity: 0.7 }}>
              Install and attach the extension to see it here.
            </Text>
          )}
        </FlexRow>

        <FlexColumn gap={0.5} sx={{ mb: 1.5 }}>
          {STEPS.map((step, i) => (
            <Text key={i} size="small">
              {i + 1}. {step}
            </Text>
          ))}
        </FlexColumn>

        <FlexRow gap={1} sx={{ flexWrap: "wrap" }}>
          <NavButton
            icon={<DownloadIcon />}
            label="Download extension"
            color="primary"
            onClick={() => window.open(downloadUrl, "_blank")}
            navSize="small"
            sx={{ padding: "0.25em 1em", minWidth: "unset" }}
          />
          {canReveal ? (
            <NavButton
              icon={<FolderOpenIcon />}
              label="Reveal build folder"
              onClick={handleReveal}
              navSize="small"
              sx={{ padding: "0.25em 1em", minWidth: "unset" }}
            />
          ) : (
            distExists && (
              <NavButton
                icon={<ContentCopyIcon />}
                label="Copy build path"
                onClick={() => handleCopy(distPath, "build path")}
                navSize="small"
                sx={{ padding: "0.25em 1em", minWidth: "unset" }}
              />
            )
          )}
          <NavButton
            icon={<ContentCopyIcon />}
            label="Copy chrome://extensions"
            onClick={() => handleCopy(CHROME_EXTENSIONS_URL, CHROME_EXTENSIONS_URL)}
            navSize="small"
            sx={{ padding: "0.25em 1em", minWidth: "unset" }}
          />
        </FlexRow>

        {distExists && (
          <Text
            size="small"
            sx={{
              mt: 1,
              fontFamily: "monospace",
              opacity: 0.7,
              wordBreak: "break-all"
            }}
          >
            {distPath}
          </Text>
        )}
      </div>
    </div>
  );
};

export default memo(BrowserExtensionSettingsMenu);
