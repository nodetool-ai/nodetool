/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  Text,
  TextInput,
  FlexColumn,
  SelectField,
  SPACING,
  type SelectOption
} from "../ui_primitives";
import ExternalLink from "../common/ExternalLink";
import { useSearchProviderCalloutStore } from "../../stores/SearchProviderCalloutStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  SEARCH_PROVIDER_CONFIGS,
  SUGGESTED_SERP_PROVIDER,
  type SerpProviderId
} from "../../utils/searchProviders";

/**
 * Pre-run prompt shown when a node uses a web-search tool but no search
 * provider is configured. Lets the user pick a provider and paste its API key
 * inline (Brave is suggested as a free default) instead of opening Settings.
 * Mounted once at the app root; driven by {@link useSearchProviderCalloutStore}.
 */
const SearchProviderSetupDialog: React.FC = () => {
  const { t } = useTranslation();
  const open = useSearchProviderCalloutStore((s) => s.open);
  const nodes = useSearchProviderCalloutStore((s) => s.nodes);
  const dismiss = useSearchProviderCalloutStore((s) => s.dismiss);

  const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<SerpProviderId>(
    SUGGESTED_SERP_PROVIDER
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const config = SEARCH_PROVIDER_CONFIGS[provider];
  const providerOptions = useMemo<SelectOption[]>(
    () =>
      Object.values(SEARCH_PROVIDER_CONFIGS).map((option) => ({
        value: option.id,
        label: option.free
          ? t("batch2_12.searchProvider.freeProvider", { provider: option.label })
          : option.label
      })),
    [t]
  );

  const providerDescription = t(`batch2_12.searchProvider.descriptions.${provider}`);
  const apiKeyLabel = t(`batch2_12.searchProvider.apiKeyLabels.${provider}`);

  const handleProviderChange = useCallback((value: string) => {
    setProvider(value as SerpProviderId);
    setCredentials({});
  }, []);

  const handleCredentialChange = useCallback(
    (field: string) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setCredentials((prev) => ({ ...prev, [field]: e.target.value }));
      },
    []
  );

  const allFilled = useMemo(
    () =>
      config.credentialFields.every(
        (field) => (credentials[field] ?? "").trim().length > 0
      ),
    [config, credentials]
  );

  const handleSave = useCallback(async () => {
    if (!allFilled || saving) return;
    setSaving(true);
    try {
      const secrets: Record<string, string> = {};
      for (const field of config.credentialFields) {
        secrets[field] = credentials[field].trim();
      }
      await updateSettings({ SERP_PROVIDER: provider }, secrets);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      addNotification({
        content: t("batch2_12.searchProvider.configured", { provider: config.label }),
        type: "success",
        alert: true
      });
      dismiss();
    } catch (error) {
      addNotification({
        content:
          error instanceof Error
            ? error.message
            : t("batch2_12.searchProvider.saveFailed"),
        type: "error",
        alert: true
      });
    } finally {
      setSaving(false);
    }
  }, [
    allFilled,
    saving,
    config,
    credentials,
    provider,
    updateSettings,
    t,
    queryClient,
    addNotification,
    dismiss
  ]);

  const nodeNames = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.nodeTitle))).join(", "),
    [nodes]
  );

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title={t("batch2_12.searchProvider.title")}
      onConfirm={handleSave}
      confirmText={t("batch2_12.searchProvider.saveAndContinue")}
      confirmDisabled={!allFilled}
      isLoading={saving}
      content={
        <FlexColumn gap={SPACING.lg}>
          <Text>
            {nodeNames
              ? t("batch2_12.searchProvider.nodeIntro", { nodes: nodeNames })
              : t("batch2_12.searchProvider.agentIntro")}
            {" "}{t("batch2_12.searchProvider.addProviderInstruction")}
          </Text>

          <SelectField
            label={t("batch2_12.searchProvider.providerLabel")}
            value={provider}
            onChange={handleProviderChange}
            options={providerOptions}
            description={providerDescription}
            size="small"
          />

          {config.credentialFields.map((field) => (
            <TextInput
              key={field}
              type="password"
              autoComplete="off"
              id={`${field.toLowerCase()}-setup-input`}
              label={t(`batch2_12.searchProvider.credentials.${field}`)}
              value={credentials[field] ?? ""}
              onChange={handleCredentialChange(field)}
              size="small"
              onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
            />
          ))}

          <ExternalLink
            href={config.getApiKeyUrl}
            tooltipText={t("batch2_12.searchProvider.visitForApiKey", { provider: config.label })}
          >
            {apiKeyLabel}
          </ExternalLink>
        </FlexColumn>
      }
    />
  );
};

SearchProviderSetupDialog.displayName = "SearchProviderSetupDialog";

export default memo(SearchProviderSetupDialog);
