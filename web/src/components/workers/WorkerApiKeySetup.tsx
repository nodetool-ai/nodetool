import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  AlertBanner,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { openSettingsTab } from "../workspace/openPageTab";
import type { WorkerTarget } from "../../hooks/useWorkers";

/** Display name of each worker target, as the provider calls itself. */
export const WORKER_PROVIDER_LABEL = {
  runpod: "RunPod",
  vast: "Vast.ai",
  verda: "Verda"
} satisfies Record<WorkerTarget, string>;

/**
 * Targets that authenticate with one pasted key, and where the user creates
 * it. Verda needs a client id and secret, so it is set up in Settings.
 */
const SINGLE_KEY_TARGETS: Partial<
  Record<WorkerTarget, { secretKey: string; keyUrl: string }>
> = {
  runpod: {
    secretKey: "RUNPOD_API_KEY",
    keyUrl: "https://www.runpod.io/console/user/settings"
  },
  vast: {
    secretKey: "VAST_API_KEY",
    keyUrl: "https://cloud.vast.ai/manage-keys/"
  }
};

interface WorkerApiKeySetupProps {
  target: WorkerTarget;
}

/**
 * Connects a worker provider without leaving the worker flow. The key is
 * checked against the provider before it is stored, the same way provider
 * onboarding stores model keys. Saving refreshes the worker key status, so the
 * caller hides this card once the key resolves.
 */
const WorkerApiKeySetup: React.FC<WorkerApiKeySetupProps> = ({ target }) => {
  const { t } = useTranslation();
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const validateSecret = useSecretsStore((s) => s.validateSecret);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const provider = WORKER_PROVIDER_LABEL[target];
  const keyTarget = SINGLE_KEY_TARGETS[target];

  const persist = useCallback(
    async (secretKey: string, key: string, verified: boolean) => {
      await updateSecret(secretKey, key);
      setValue("");
      setRejected(false);
      addNotification({
        type: verified ? "success" : "warning",
        content: verified
          ? t("i18n-next33.provider.connected", { provider })
          : t("i18n-next33.provider.keyUnverified"),
        alert: true
      });
    },
    [updateSecret, addNotification, provider, t]
  );

  const handleSave = useCallback(
    async (force: boolean) => {
      const trimmed = value.trim();
      if (!keyTarget || !trimmed || saving) {
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        if (force) {
          await persist(keyTarget.secretKey, trimmed, false);
          return;
        }
        const result = await validateSecret(keyTarget.secretKey, trimmed);
        if (result.status === "invalid") {
          setRejected(true);
          return;
        }
        await persist(keyTarget.secretKey, trimmed, result.status === "valid");
      } catch {
        setSaveError(t("i18n-next33.provider.saveError"));
      } finally {
        setSaving(false);
      }
    },
    [keyTarget, value, saving, persist, validateSecret, t]
  );

  if (!keyTarget) {
    return (
      <AlertBanner
        severity="warning"
        compact
        title={t("screens4_8.workers.apiKey.title", { provider })}
      >
        <FlexColumn gap={SPACING.sm} align="flex-start">
          <span>
            {t("screens4_8.workers.apiKey.settingsDescription", { provider })}
          </span>
          <EditorButton
            density="compact"
            variant="outlined"
            size="small"
            startIcon={<SettingsOutlinedIcon />}
            onClick={() => openSettingsTab("providers")}
          >
            {t("screens4_8.workers.apiKey.openSettings")}
          </EditorButton>
        </FlexColumn>
      </AlertBanner>
    );
  }

  return (
    <Card variant="outlined" padding="normal" className="nodrag nowheel">
      <FlexColumn gap={SPACING.md}>
        <FlexColumn gap={SPACING.micro}>
          <Text size="normal" weight={600}>
            {t("screens4_8.workers.apiKey.title", { provider })}
          </Text>
          <Caption size="small">
            {t("screens4_8.workers.apiKey.description", { provider })}
          </Caption>
        </FlexColumn>
        <FlexRow gap={SPACING.xs} align="flex-start">
          <TextInput
            size="small"
            type="password"
            label={t("i18n-next33.provider.apiKeyLabel", { provider })}
            placeholder={t("i18n-next33.provider.apiKeyPlaceholder", { provider })}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setRejected(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSave(false);
              }
            }}
            errorMessage={
              rejected ? t("i18n-next33.provider.keyRejected") : undefined
            }
            slotProps={
              rejected ? { formHelperText: { role: "alert" } } : undefined
            }
            fullWidth
          />
          <EditorButton
            variant="contained"
            density="compact"
            size="small"
            onClick={() => void handleSave(false)}
            disabled={!value.trim()}
            loading={saving}
          >
            {t("i18n-next33.provider.connect")}
          </EditorButton>
        </FlexRow>
        <FlexRow gap={SPACING.xs} align="center" wrap>
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            endIcon={<OpenInNewIcon />}
            onClick={() =>
              window.open(keyTarget.keyUrl, "_blank", "noopener,noreferrer")
            }
          >
            {t("i18n-next33.provider.getKey", { provider })}
          </EditorButton>
          {rejected && (
            <EditorButton
              density="compact"
              variant="text"
              size="small"
              onClick={() => void handleSave(true)}
              disabled={saving}
            >
              {t("i18n-next33.provider.saveAnyway")}
            </EditorButton>
          )}
        </FlexRow>
        {saveError && (
          <AlertBanner severity="error" compact>
            {saveError}
          </AlertBanner>
        )}
      </FlexColumn>
    </Card>
  );
};

export default memo(WorkerApiKeySetup);
