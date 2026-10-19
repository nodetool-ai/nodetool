import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StorageRetentionPolicy } from "@nodetool-ai/protocol/api-schemas/settings.js";
import { useStorageHistory } from "../../serverState/useStorageHistory";
import { useNotificationStore } from "../../stores/NotificationStore";
import { ConfirmDialog, LoadingSpinner } from "../ui_primitives";
import {
  AlertBanner,
  EditorButton,
  FlexRow,
  LabeledSwitch,
  NumberField,
  SPACING,
  Text
} from "../ui_primitives";

interface RetentionSettingProps {
  label: string;
  description: ReactNode;
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max: number;
  fallback: number;
  disabled: boolean;
  rangeHint: (values: { min: number; max: number; fallback: number }) => string;
}

function RetentionSetting({
  label,
  description,
  value,
  onCommit,
  min,
  max,
  fallback,
  disabled,
  rangeHint
}: RetentionSettingProps) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const clamped = Math.max(min, Math.min(max, Number(local) || fallback));
    setLocal(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }, [fallback, local, max, min, onCommit, value]);

  return (
    <NumberField
      autoComplete="off"
      min={min}
      max={max}
      id={label}
      label={label}
      helperText={<>{description} {rangeHint({ min, max, fallback })}</>}
      value={local}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
      size="small"
      disabled={disabled}
    />
  );
}

function formatBytes(
  bytes: number | null,
  locale: string,
  unavailable: string
): string {
  if (bytes === null) return unavailable;
  const unit =
    bytes < 1024 * 1024 ? "KB" : bytes < 1024 * 1024 * 1024 ? "MB" : "GB";
  const divisor =
    unit === "KB" ? 1024 : unit === "MB" ? 1024 * 1024 : 1024 * 1024 * 1024;
  const fractionDigits = unit === "KB" ? 0 : unit === "MB" ? 1 : 2;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: unit === "KB" ? 0 : fractionDigits
  }).format(bytes / divisor)} ${unit}`;
}

export default function StorageHistorySettings() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rangeHint = useCallback(
    ({ min, max, fallback }: { min: number; max: number; fallback: number }) =>
      t("screens4_0.settings.storageHistory.rangeHint", {
        min: new Intl.NumberFormat(locale).format(min),
        max: new Intl.NumberFormat(locale).format(max),
        fallback: new Intl.NumberFormat(locale).format(fallback)
      }),
    [locale, t]
  );
  const history = useStorageHistory();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [confirmation, setConfirmation] = useState<
    "cleanup" | "compact" | null
  >(null);
  const policy = history.data?.policy;
  const status = history.data?.status;

  const updatePolicy = useCallback(
    (changes: Partial<StorageRetentionPolicy>) => {
      if (!policy) return;
      void history.updatePolicy({ ...policy, ...changes }).catch((error) => {
        addNotification({
          type: "error",
          content: t("screens4_0.settings.storageHistory.updateFailed", {
            error: String(error)
          })
        });
      });
    },
    [addNotification, history, policy]
  );

  const runConfirmedAction = useCallback(() => {
    if (confirmation === "cleanup") {
      void history
        .cleanup()
        .then((result) => {
          const { total, redactedPredictions } = result.deleted;
          addNotification({
            type: "success",
            content:
              redactedPredictions > 0
              ? t("screens4_0.settings.storageHistory.cleanupCompletedWithRedactions", {
                  count: total,
                  redactedCount: redactedPredictions
                })
                : t("screens4_0.settings.storageHistory.cleanupCompleted", {
                    count: total
                  })
          });
        })
        .catch((error) => {
          addNotification({
            type: "error",
            content: t("screens4_0.settings.storageHistory.cleanupFailed", {
              error: String(error)
            })
          });
        });
    } else if (confirmation === "compact") {
      void history
        .compact()
        .then(() => {
          addNotification({
            type: "success",
            content: t("screens4_0.settings.storageHistory.compactionCompleted")
          });
        })
        .catch((error) => {
          addNotification({
            type: "error",
            content: t("screens4_0.settings.storageHistory.compactionFailed", {
              error: String(error)
            })
          });
        });
    }
  }, [addNotification, confirmation, history, t]);

  if (history.isLoading) {
    return <LoadingSpinner size="small" text={t("screens4_0.settings.storageHistory.loading")} />;
  }
  if (history.error || !policy || !status) {
    return (
      <AlertBanner severity="error" compact>
        {t("screens4_0.settings.storageHistory.loadFailed")}
      </AlertBanner>
    );
  }

  const disabled =
    history.isUpdating || history.isCleaning || history.isCompacting;
  const cleanupCount = status.cleanup.total;
  const redactionCount = status.cleanup.redactedPredictions;
  // Records this sweep will change: the ones it removes plus the ones it
  // clears. `cleanup.total` counts removals only, so it cannot stand in here.
  const pendingCount = cleanupCount + redactionCount;
  const isSqlite = status.dialect === "sqlite";

  return (
    <>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.autosavesPerWorkflow.label")}
          description={t("screens4_0.settings.storageHistory.autosavesPerWorkflow.description")}
          value={policy.maxAutosavesPerWorkflow}
          onCommit={(value) => updatePolicy({ maxAutosavesPerWorkflow: value })}
          min={1}
          max={500}
          fallback={10}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.autosaveRetention.label")}
          description={t("screens4_0.settings.storageHistory.autosaveRetention.description")}
          value={policy.autosaveRetentionDays}
          onCommit={(value) => updatePolicy({ autosaveRetentionDays: value })}
          min={1}
          max={3650}
          fallback={7}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.manualVersionRetention.label")}
          description={t("screens4_0.settings.storageHistory.manualVersionRetention.description")}
          value={policy.manualVersionRetentionDays}
          onCommit={(value) =>
            updatePolicy({ manualVersionRetentionDays: value })
          }
          min={1}
          max={3650}
          fallback={90}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.completedRunRetention.label")}
          description={t("screens4_0.settings.storageHistory.completedRunRetention.description")}
          value={policy.terminalJobRetentionDays}
          onCommit={(value) =>
            updatePolicy({ terminalJobRetentionDays: value })
          }
          min={1}
          max={3650}
          fallback={30}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.runEventRetention.label")}
          description={t("screens4_0.settings.storageHistory.runEventRetention.description")}
          value={policy.runEventRetentionDays ?? 30}
          onCommit={(value) => updatePolicy({ runEventRetentionDays: value })}
          min={1}
          max={3650}
          fallback={30}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.runTraceRetention.label")}
          description={t("screens4_0.settings.storageHistory.runTraceRetention.description")}
          value={policy.runTraceRetentionDays ?? 30}
          onCommit={(value) => updatePolicy({ runTraceRetentionDays: value })}
          min={1}
          max={3650}
          fallback={30}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <RetentionSetting
          label={t("screens4_0.settings.storageHistory.generationRetention.label")}
          description={t("screens4_0.settings.storageHistory.generationRetention.description")}
          value={policy.predictionRetentionDays ?? 400}
          onCommit={(value) => updatePolicy({ predictionRetentionDays: value })}
          min={1}
          max={3650}
          fallback={400}
          disabled={disabled}
          rangeHint={rangeHint}
        />
      </div>
      <div className="settings-item">
        <LabeledSwitch
          label={t("screens4_0.settings.storageHistory.automaticCleanup.label")}
          checked={policy.automaticCleanup}
          onChange={(checked) => updatePolicy({ automaticCleanup: checked })}
          description={t("screens4_0.settings.storageHistory.automaticCleanup.description")}
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <Text>
          {t("screens4_0.settings.storageHistory.databaseSummary", {
            databaseSize: formatBytes(status.databaseBytes, locale, t("screens4_0.settings.storageHistory.notAvailable")),
            workflowVersions: status.workflowVersions,
            runs: status.jobs,
            runEvents: status.runEvents
          })}
        </Text>
        <Text className="description">
          {t("screens4_0.settings.storageHistory.cleanupStatus", {
            count: cleanupCount,
            unusedBytes: formatBytes(status.unusedBytes, locale, t("screens4_0.settings.storageHistory.notAvailable"))
          })}
        </Text>
        <Text className="description">
          {t("screens4_0.settings.storageHistory.redactionStatus", {
            count: redactionCount,
            total: status.predictionsWithPayload
          })}
        </Text>
        <FlexRow gap={SPACING.md} wrap sx={{ marginTop: SPACING.md }}>
          <EditorButton
            variant="outlined"
            onClick={() => setConfirmation("cleanup")}
            disabled={disabled || pendingCount === 0}
          >
            {history.isCleaning
              ? t("screens4_0.settings.storageHistory.cleaning")
              : t("screens4_0.settings.storageHistory.cleanNow", { count: pendingCount })}
          </EditorButton>
          {isSqlite && (
            <EditorButton
              variant="outlined"
              onClick={() => setConfirmation("compact")}
              disabled={disabled}
            >
              {history.isCompacting
                ? t("screens4_0.settings.storageHistory.compacting")
                : t("screens4_0.settings.storageHistory.compactDatabase")}
            </EditorButton>
          )}
        </FlexRow>
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={runConfirmedAction}
        title={
          confirmation === "compact"
            ? t("screens4_0.settings.storageHistory.confirmCompactTitle")
            : t("screens4_0.settings.storageHistory.confirmCleanupTitle")
        }
        content={
          confirmation === "compact"
            ? t("screens4_0.settings.storageHistory.confirmCompactDescription")
            : t("screens4_0.settings.storageHistory.confirmCleanupDescription", {
                cleanupCount,
                redactionCount
              })
        }
        confirmText={confirmation === "compact"
          ? t("screens4_0.settings.storageHistory.compact")
          : t("screens4_0.settings.storageHistory.clean")}
        cancelText={t("screens4_0.settings.storageHistory.cancel")}
      />
    </>
  );
}
