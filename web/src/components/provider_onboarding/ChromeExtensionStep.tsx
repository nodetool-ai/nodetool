import { memo, useCallback, useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import {
  Box,
  Caption,
  Chip,
  CopyButton,
  EditorButton,
  ExternalLink,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import {
  useExtensionStatus,
  useInstallExtensionHost
} from "../../serverState/useExtensionStatus";
import { BASE_URL } from "../../stores/BASE_URL";

export const CHROME_EXTENSIONS_URL = "chrome://extensions";

/** What the extension makes possible, in the order a new user cares about. */
export const EXTENSION_BENEFITS: readonly string[] = [
  "Generate images with ChatGPT, and images and Veo video with Gemini, on the plans you already pay for. There is no API key and no per-image bill.",
  "Every result is saved to your NodeTool assets, ready for workflows, sketches and the timeline.",
  "The agent can work on any site you are signed in to: it clicks, types and saves media inside your own tab."
];

const isWindows = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

interface SetupStepProps {
  index: number;
  title: string;
  children?: React.ReactNode;
}

const SetupStep: React.FC<SetupStepProps> = ({ index, title, children }) => {
  const theme = useTheme();
  return (
    <FlexRow component="li" gap={SPACING.lg} align="flex-start">
      <FlexRow
        align="center"
        justify="center"
        aria-hidden
        sx={{
          width: 24,
          height: 24,
          minWidth: 24,
          borderRadius: BORDER_RADIUS.circle,
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Caption size="small">{index}</Caption>
      </FlexRow>
      <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minWidth: 0 }}>
        <Text size="small">{title}</Text>
        {children}
      </FlexColumn>
    </FlexRow>
  );
};

/**
 * The extension page of the subscription onboarding dialog: why the Chrome
 * extension matters, how it reaches ChatGPT and Gemini, the setup steps, and
 * a live connection status so the user sees the moment it works.
 */
const ChromeExtensionStep: React.FC = () => {
  const theme = useTheme();
  const { status, isLoading } = useExtensionStatus();
  const connected = status?.connected ?? false;
  const distPath = status?.distPath ?? "";
  const hostInstalled = status?.hostInstalled ?? false;
  // The desktop app ships the built extension, so Load unpacked can take its
  // folder as is. A browser tab gets the same build as a zip.
  const canReveal = Boolean(status?.distExists && distPath && window.api?.showItemInFolder);
  const host = useInstallExtensionHost();
  const { install } = host;

  // Register the bridge as soon as this page shows it missing, so the user
  // has nothing to run. Once per visit: a failure waits for "Try again".
  const triedInstall = useRef(false);
  useEffect(() => {
    if (!status || status.hostInstalled || triedInstall.current || isWindows()) {
      return;
    }
    triedInstall.current = true;
    install();
  }, [status, install]);

  const handleDownload = useCallback(() => {
    window.open(`${BASE_URL}/api/extension/download`, "_blank", "noopener,noreferrer");
  }, []);

  const handleReveal = useCallback(() => {
    if (distPath && window.api?.showItemInFolder) {
      void window.api.showItemInFolder(distPath);
    }
  }, [distPath]);

  return (
    <FlexColumn gap={SPACING.xxl}>
      <FlexColumn gap={SPACING.md}>
        <Text sx={{ maxWidth: "60ch" }}>
          ChatGPT and Gemini have no API for the images and video your plan
          includes. The NodeTool extension for Chrome lets NodeTool use them
          through your own signed-in browser.
        </Text>
        <FlexRow gap={SPACING.md} align="center" wrap>
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
                  : "Extension not connected"
            }
            color={connected ? "success" : "default"}
          />
          {!connected && !isLoading && (
            <Caption>This updates on its own once the setup below is done.</Caption>
          )}
        </FlexRow>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">Why add it</Text>
        <FlexColumn component="ul" gap={SPACING.sm} sx={{ m: 0, pl: SPACING.xl }}>
          {EXTENSION_BENEFITS.map((benefit) => (
            <Text component="li" key={benefit} size="small" weight={400}>
              {benefit}
            </Text>
          ))}
        </FlexColumn>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">How it works</Text>
        <Text size="small" weight={400} sx={{ maxWidth: "60ch" }}>
          When a workflow or the chat asks ChatGPT or Gemini for an image or a
          video, NodeTool finds your open chatgpt.com or gemini.google.com tab
          and submits the prompt through the site&apos;s own page. The finished
          file comes back to NodeTool. Your password and cookies stay in
          Chrome, and each request appears in your ChatGPT or Gemini history.
        </Text>
        <Caption>
          Chrome shows a &ldquo;Nodetool is debugging this browser&rdquo; bar while a
          request runs. The extension does nothing on other tabs.
        </Caption>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">Set it up</Text>
        <FlexColumn
          component="ol"
          gap={SPACING.lg}
          sx={{
            m: 0,
            p: SPACING.xl,
            listStyle: "none",
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: BORDER_RADIUS.lg
          }}
        >
          <SetupStep index={1} title="Let Chrome start NodeTool's browser bridge.">
            {isWindows() ? (
              <Caption color="warning">
                This is not supported on Windows yet. Media generation through
                the extension works on macOS and Linux.
              </Caption>
            ) : hostInstalled ? (
              <FlexRow gap={SPACING.xs} align="center">
                <CheckCircleRoundedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.success.main }} />
                <Caption>Done. NodeTool registered its bridge with your browsers.</Caption>
              </FlexRow>
            ) : host.isInstalling || !status ? (
              <FlexRow gap={SPACING.sm} align="center">
                <LoadingSpinner size="small" inline />
                <Caption>Registering with your browsers…</Caption>
              </FlexRow>
            ) : (
              <FlexColumn gap={SPACING.sm} align="flex-start">
                {host.error && <Caption color="error">{host.error}</Caption>}
                <EditorButton density="compact" variant="outlined" size="small" onClick={() => install()}>
                  {host.error ? "Try again" : "Register"}
                </EditorButton>
              </FlexColumn>
            )}
          </SetupStep>
          <SetupStep
            index={2}
            title={canReveal ? "Open the extension folder that comes with NodeTool." : "Download the extension NodeTool provides and unzip it."}
          >
            <FlexRow gap={SPACING.md} wrap>
              {canReveal ? (
                <EditorButton
                  density="compact"
                  variant="contained"
                  size="small"
                  startIcon={<FolderOpenIcon />}
                  onClick={handleReveal}
                >
                  Show extension folder
                </EditorButton>
              ) : (
                <EditorButton
                  density="compact"
                  variant="contained"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownload}
                >
                  Download extension
                </EditorButton>
              )}
            </FlexRow>
          </SetupStep>
          <SetupStep
            index={3}
            title="Open chrome://extensions, turn on Developer mode, click Load unpacked and choose that folder."
          >
            <FlexRow gap={SPACING.sm} align="center">
              <Box component="code" sx={{ fontFamily: theme.fontFamily2 }}>
                {CHROME_EXTENSIONS_URL}
              </Box>
              <CopyButton value={CHROME_EXTENSIONS_URL} tooltip="Copy address" />
            </FlexRow>
            <Caption>
              Chrome does not open this address from a link, so paste it into
              the address bar. If NodeTool is already in the list, click its
              reload button instead.
            </Caption>
          </SetupStep>
          <SetupStep
            index={4}
            title="Sign in to ChatGPT and Gemini in Chrome and keep those tabs open."
          >
            <FlexRow gap={SPACING.lg} wrap>
              <ExternalLink href="https://chatgpt.com" size="small">chatgpt.com</ExternalLink>
              <ExternalLink href="https://gemini.google.com" size="small">gemini.google.com</ExternalLink>
            </FlexRow>
          </SetupStep>
        </FlexColumn>
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(ChromeExtensionStep);
