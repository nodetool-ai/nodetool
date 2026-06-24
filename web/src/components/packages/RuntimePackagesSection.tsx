/** @jsxImportSource @emotion/react */
/**
 * RuntimePackagesSection — the "Software" tab of the unified Package Manager.
 *
 * Lists the system runtimes NodeTool can install (Python, FFmpeg, Node, pandoc,
 * yt-dlp, …) and drives install/uninstall through the Electron
 * `window.api.packages` IPC, streaming the conda/uv/npm console live. Runtime
 * installation is desktop-only, so in the browser this renders a notice.
 */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  AlertBanner,
  BORDER_RADIUS,
  Chip,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text
} from "../ui_primitives";
import useRuntimePackagesStore from "../../stores/RuntimePackagesStore";

const consoleStyles = (theme: Theme) =>
  css({
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.text.secondary,
    backgroundColor: theme.vars.palette.action.hover,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.xs,
    padding: "0.75em",
    margin: 0,
    maxHeight: "220px",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  });

const RuntimePackagesSection = () => {
  const theme = useTheme();
  const [consoleOpen, setConsoleOpen] = useState(false);

  const {
    available,
    statuses,
    installLocation,
    busyIds,
    consoleLines,
    isLoading,
    error,
    refresh,
    install,
    uninstall,
    selectInstallLocation,
    subscribeConsole,
    unsubscribeConsole,
    clearConsole
  } = useRuntimePackagesStore(
    useShallow((s) => ({
      available: s.available,
      statuses: s.statuses,
      installLocation: s.installLocation,
      busyIds: s.busyIds,
      consoleLines: s.consoleLines,
      isLoading: s.isLoading,
      error: s.error,
      refresh: s.refresh,
      install: s.install,
      uninstall: s.uninstall,
      selectInstallLocation: s.selectInstallLocation,
      subscribeConsole: s.subscribeConsole,
      unsubscribeConsole: s.unsubscribeConsole,
      clearConsole: s.clearConsole
    }))
  );

  useEffect(() => {
    if (!available) return;
    void refresh();
    subscribeConsole();
    return () => unsubscribeConsole();
  }, [available, refresh, subscribeConsole, unsubscribeConsole]);

  if (!available) {
    return (
      <AlertBanner severity="info">
        Software installation runs in the NodeTool desktop app. Open the desktop
        app to install Python, FFmpeg, and other runtimes.
      </AlertBanner>
    );
  }

  return (
    <FlexColumn gap={2}>
      <FlexColumn gap={1}>
        <Text size="normal" weight={600}>
          Install location
        </Text>
        <FlexRow gap={1.5} align="center" justify="space-between">
          <Text size="small" color="secondary" family="secondary" truncate>
            {installLocation || "Default conda environment"}
          </Text>
          <EditorButton
            variant="outlined"
            density="compact"
            onClick={() => void selectInstallLocation()}
          >
            Change…
          </EditorButton>
        </FlexRow>
      </FlexColumn>

      <Divider />

      {error && (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      )}

      <FlexColumn gap={1}>
        {statuses.map((rt) => {
          const busy = busyIds.includes(rt.id) || rt.installing;
          return (
            <FlexRow
              key={rt.id}
              gap={1.5}
              align="center"
              justify="space-between"
              sx={{
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: BORDER_RADIUS.xs
              }}
            >
              <FlexColumn gap={0.25} sx={{ minWidth: 0, flex: 1 }}>
                <FlexRow gap={1} align="center">
                  <Text size="normal" weight={600} truncate>
                    {rt.name}
                  </Text>
                  <Chip
                    label={rt.installed ? "Installed" : "Not installed"}
                    color={rt.installed ? "success" : "default"}
                    compact
                  />
                </FlexRow>
                <Text size="small" color="secondary">
                  {rt.description}
                </Text>
              </FlexColumn>
              {rt.installed ? (
                <EditorButton
                  variant="outlined"
                  density="compact"
                  disabled={busy}
                  onClick={() => void uninstall(rt.id)}
                >
                  {busy ? "Working…" : "Uninstall"}
                </EditorButton>
              ) : (
                <EditorButton
                  variant="contained"
                  density="compact"
                  disabled={busy}
                  onClick={() => void install(rt.id)}
                >
                  {busy ? "Installing…" : "Install"}
                </EditorButton>
              )}
            </FlexRow>
          );
        })}
        {statuses.length === 0 && !isLoading && (
          <Text size="small" color="secondary">
            No runtimes reported.
          </Text>
        )}
      </FlexColumn>

      <Divider />

      <FlexColumn gap={1}>
        <FlexRow gap={1.5} align="center" justify="space-between">
          <EditorButton
            variant="text"
            density="compact"
            onClick={() => setConsoleOpen((v) => !v)}
            aria-expanded={consoleOpen}
          >
            {consoleOpen ? "Hide console" : "Show console"}
            {consoleLines.length > 0 ? ` (${consoleLines.length})` : ""}
          </EditorButton>
          {consoleOpen && consoleLines.length > 0 && (
            <EditorButton
              variant="text"
              density="compact"
              onClick={() => clearConsole()}
            >
              Clear
            </EditorButton>
          )}
        </FlexRow>
        {consoleOpen && (
          <pre css={consoleStyles(theme)}>
            {consoleLines.length > 0
              ? consoleLines.join("\n")
              : "No output yet. Install a runtime to see logs."}
          </pre>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(RuntimePackagesSection);
