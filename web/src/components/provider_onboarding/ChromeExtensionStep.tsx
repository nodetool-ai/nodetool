import { memo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import ErrorBanner from "../support/ErrorBanner";
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
  const { t } = useTranslation();
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
          {t("i18n-next7.chromeExtension.intro")}
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
                ? t("i18n-next7.chromeExtension.checking")
                : connected
                  ? t("i18n-next7.chromeExtension.connected")
                  : t("i18n-next7.chromeExtension.notConnected")
            }
            color={connected ? "success" : "default"}
          />
          {!connected && !isLoading && (
            <Caption>{t("i18n-next7.chromeExtension.autoUpdate")}</Caption>
          )}
        </FlexRow>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">{t("i18n-next7.chromeExtension.whyAdd")}</Text>
        <FlexColumn component="ul" gap={SPACING.sm} sx={{ m: 0, pl: SPACING.xl }}>
          {["benefitImages", "benefitAssets", "benefitAgent"].map((key) => (
            <Text component="li" key={key} size="small" weight={400}>
              {t(`i18n-next7.chromeExtension.${key}`)}
            </Text>
          ))}
        </FlexColumn>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">{t("i18n-next7.chromeExtension.howItWorks")}</Text>
        <Text size="small" weight={400} sx={{ maxWidth: "60ch" }}>
          {t("i18n-next7.chromeExtension.workflow")}
        </Text>
        <Caption>
          {t("i18n-next7.chromeExtension.debuggingNotice")}
        </Caption>
      </FlexColumn>

      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">{t("i18n-next7.chromeExtension.setup")}</Text>
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
          <SetupStep index={1} title={t("i18n-next7.chromeExtension.step1")}>
            {isWindows() ? (
              <Caption color="warning">
                {t("i18n-next7.chromeExtension.windowsUnsupported")}
              </Caption>
            ) : hostInstalled ? (
              <FlexRow gap={SPACING.xs} align="center">
                <CheckCircleRoundedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.success.main }} />
                <Caption>{t("i18n-next7.chromeExtension.bridgeRegistered")}</Caption>
              </FlexRow>
            ) : host.isInstalling || !status ? (
              <FlexRow gap={SPACING.sm} align="center">
                <LoadingSpinner size="small" inline />
                <Caption>{t("i18n-next7.chromeExtension.registering")}</Caption>
              </FlexRow>
            ) : (
              <FlexColumn gap={SPACING.sm} align="flex-start">
                {host.error && (
                  <ErrorBanner
                    report={{
                      source: "operation-failure",
                      summary: t("i18n-next7.chromeExtension.registrationFailed"),
                      errorText: host.error
                    }}
                  >
                    {host.error}
                  </ErrorBanner>
                )}
                <EditorButton density="compact" variant="outlined" size="small" onClick={() => install()}>
                  {host.error ? t("i18n-next7.chromeExtension.tryAgain") : t("i18n-next7.chromeExtension.register")}
                </EditorButton>
              </FlexColumn>
            )}
          </SetupStep>
          <SetupStep
            index={2}
            title={t(canReveal ? "i18n-next7.chromeExtension.step2Open" : "i18n-next7.chromeExtension.step2Download")}
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
                  {t("i18n-next7.chromeExtension.showFolder")}
                </EditorButton>
              ) : (
                <EditorButton
                  density="compact"
                  variant="contained"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownload}
                >
                  {t("i18n-next7.chromeExtension.downloadExtension")}
                </EditorButton>
              )}
            </FlexRow>
          </SetupStep>
          <SetupStep
            index={3}
            title={t("i18n-next7.chromeExtension.step3")}
          >
            <FlexRow gap={SPACING.sm} align="center">
              <Box component="code" sx={{ fontFamily: theme.fontFamily2 }}>
                {CHROME_EXTENSIONS_URL}
              </Box>
              <CopyButton value={CHROME_EXTENSIONS_URL} tooltip={t("i18n-next7.chromeExtension.copyAddress")} />
            </FlexRow>
            <Caption>
              {t("i18n-next7.chromeExtension.extensionAddressHelp")}
            </Caption>
          </SetupStep>
          <SetupStep
            index={4}
            title={t("i18n-next7.chromeExtension.step4")}
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
