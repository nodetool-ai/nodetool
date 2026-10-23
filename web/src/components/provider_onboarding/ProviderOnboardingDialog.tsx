/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Box, Button, Caption, Dialog, EditorButton, FlexColumn, FlexRow, Text,
  BORDER_RADIUS, SPACING
} from "../ui_primitives";
import { useSecrets } from "../../hooks/useSecrets";
import useProviderOnboardingStore from "../../stores/ProviderOnboardingStore";
import { isElectron, isLocalhost } from "../../lib/env";
import { openSettingsTab } from "../workspace/openPageTab";
import ollamaIcon from "../../icons/providers/ollama.svg";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import { providersForCapability } from "./providerOnboardingCatalog";

const ProviderOnboardingDialog: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { open, capability, stepCapabilities, reason, highlightSecretKey, dismiss } =
    useProviderOnboardingStore(useShallow((s) => ({
      open: s.open, capability: s.capability, stepCapabilities: s.stepCapabilities,
      reason: s.reason, highlightSecretKey: s.highlightSecretKey, dismiss: s.dismiss
    })));
  const { secrets } = useSecrets();
  const configuredKeys = useMemo(
    () => new Set(secrets.filter((s) => s.is_configured).map((s) => s.key)),
    [secrets]
  );
  const providers = useMemo(
    () => providersForCapability(capability, stepCapabilities),
    [capability, stepCapabilities]
  );
  const forStep = (stepCapabilities?.length ?? 0) > 0;
  const groups = [
    { title: t("batch2_7.providerOnboarding.signInGroup"), providers: providers.filter((p) => p.oauth) },
    { title: t("batch2_7.providerOnboarding.apiKeyGroup"), providers: providers.filter((p) => !p.oauth) }
  ];
  const showLocal = (isElectron || isLocalhost) &&
    (!capability || capability === "generate_message" || capability === "generate_embedding");
  const handleOpenSettings = useCallback(() => {
    dismiss();
    openSettingsTab("providers");
  }, [dismiss]);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      maxWidth="sm"
      fullWidth
      title={t("batch2_7.providerOnboarding.title")}
      actions={
        <>
          <Button variant="text" color="inherit" onClick={handleOpenSettings} sx={{ mr: "auto" }}>{t("batch2_7.providerOnboarding.allProviders")}</Button>
          <Button variant="contained" onClick={dismiss}>{t("batch2_7.providerOnboarding.done")}</Button>
        </>
      }
    >
      <FlexColumn gap={SPACING.xxl}>
        <FlexColumn gap={SPACING.md}>
          <Text sx={{ maxWidth: "60ch" }}>
            {reason ?? (forStep
              ? t("batch2_7.providerOnboarding.stepPrompt")
              : capability
                ? t("batch2_7.providerOnboarding.capabilityPrompt", { capability: t(`batch2_7.providerOnboarding.capabilities.${capability}`) })
                : t("batch2_7.providerOnboarding.chooseProvider"))}
          </Text>
          <Caption size="small">{t("batch2_7.providerOnboarding.billing")}</Caption>
        </FlexColumn>
        {groups.filter((group) => group.providers.length > 0).map((group) => (
          <FlexColumn key={group.title} gap={SPACING.md}>
            <Text component="h3" size="small">{group.title}</Text>
            <FlexColumn sx={{ border: `1px solid ${theme.vars.palette.divider}`, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" }}>
              {group.providers.map((provider) => (
                <ProviderOnboardingCard
                  key={provider.id}
                  provider={provider}
                  configured={configuredKeys.has(provider.secretKey)}
                  defaultExpanded={highlightSecretKey === provider.secretKey}
                />
              ))}
            </FlexColumn>
          </FlexColumn>
        ))}
        {showLocal && (
          <FlexRow align="center" gap={SPACING.lg} wrap>
            <Box component="img" src={ollamaIcon} alt="" sx={{ width: 28, height: 28, ...theme.applyStyles("dark", { filter: "invert(1)" }) }} />
            <FlexColumn gap={SPACING.xs} sx={{ flex: "1 1 180px" }}>
              <Text size="small">{t("batch2_7.providerOnboarding.localTitle")}</Text>
              <Caption>{t("batch2_7.providerOnboarding.localDescription")}</Caption>
            </FlexColumn>
            <EditorButton component="a" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" variant="text" endIcon={<OpenInNewIcon />}>{t("batch2_7.providerOnboarding.getOllama")}</EditorButton>
          </FlexRow>
        )}
        <FlexRow gap={SPACING.md} align="center">
          <LockOutlinedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.text.secondary }} />
          <Caption>{t("batch2_7.providerOnboarding.encryptedKeys")}</Caption>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(ProviderOnboardingDialog);
