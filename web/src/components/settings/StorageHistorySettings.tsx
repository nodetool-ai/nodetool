import { useCallback, useState } from "react";
import type { StorageRetentionPolicy } from "@nodetool-ai/protocol/api-schemas/settings.js";
import { useStorageHistory } from "../../serverState/useStorageHistory";
import { useNotificationStore } from "../../stores/NotificationStore";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { NumberSetting } from "../menus/NumberSetting";
import {
  AlertBanner,
  EditorButton,
  FlexRow,
  LabeledSwitch,
  Text
} from "../ui_primitives";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Not available";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function StorageHistorySettings() {
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
          content: `Could not update history limits: ${String(error)}`
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
          addNotification({
            type: "success",
            content: `Removed ${result.deleted.total} old history records.`
          });
        })
        .catch((error) => {
          addNotification({
            type: "error",
            content: `History cleanup failed: ${String(error)}`
          });
        });
    } else if (confirmation === "compact") {
      void history
        .compact()
        .then(() => {
          addNotification({
            type: "success",
            content: "Database compaction completed."
          });
        })
        .catch((error) => {
          addNotification({
            type: "error",
            content: `Database compaction failed: ${String(error)}`
          });
        });
    }
  }, [addNotification, confirmation, history]);

  if (history.isLoading) {
    return <Text className="description">Loading history status…</Text>;
  }
  if (history.error || !policy || !status) {
    return (
      <AlertBanner severity="error" compact>
        Could not load database history settings.
      </AlertBanner>
    );
  }

  const disabled =
    history.isUpdating || history.isCleaning || history.isCompacting;
  const cleanupCount = status.cleanup.total;
  const isSqlite = status.dialect === "sqlite";

  return (
    <>
      <div className="settings-item">
        <NumberSetting
          label="Autosaves per workflow"
          description="Maximum recent autosaves kept for each workflow. Manual versions do not count toward this limit."
          value={policy.maxAutosavesPerWorkflow}
          onCommit={(value) => updatePolicy({ maxAutosavesPerWorkflow: value })}
          min={1}
          max={500}
          fallback={10}
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <NumberSetting
          label="Keep autosaves (days)"
          description="Autosaves older than this are removed even when the workflow is below its count limit."
          value={policy.autosaveRetentionDays}
          onCommit={(value) => updatePolicy({ autosaveRetentionDays: value })}
          min={1}
          max={3650}
          fallback={7}
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <NumberSetting
          label="Keep manual versions (days)"
          description="Manual workflow snapshots older than this are removed. Checkpoints are always preserved."
          value={policy.manualVersionRetentionDays}
          onCommit={(value) =>
            updatePolicy({ manualVersionRetentionDays: value })
          }
          min={1}
          max={3650}
          fallback={90}
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <NumberSetting
          label="Keep completed runs (days)"
          description="Completed, failed, and cancelled run records older than this are removed. Active runs are preserved."
          value={policy.terminalJobRetentionDays}
          onCommit={(value) =>
            updatePolicy({ terminalJobRetentionDays: value })
          }
          min={1}
          max={3650}
          fallback={30}
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <LabeledSwitch
          label="Automatic history cleanup"
          checked={policy.automaticCleanup}
          onChange={(checked) => updatePolicy({ automaticCleanup: checked })}
          description="Apply these limits in the background once per day. Database compaction remains manual."
          disabled={disabled}
        />
      </div>
      <div className="settings-item">
        <Text>
          Database: {formatBytes(status.databaseBytes)} ·{" "}
          {status.workflowVersions} workflow versions · {status.jobs} runs
        </Text>
        <Text className="description">
          {cleanupCount} records exceed the current limits. Deleted SQLite pages
          currently use {formatBytes(status.unusedBytes)} and are returned to
          disk only after compaction.
        </Text>
        <FlexRow gap={2} wrap sx={{ marginTop: 2 }}>
          <EditorButton
            variant="outlined"
            onClick={() => setConfirmation("cleanup")}
            disabled={disabled || cleanupCount === 0}
          >
            {history.isCleaning ? "Cleaning…" : `Clean now (${cleanupCount})`}
          </EditorButton>
          {isSqlite && (
            <EditorButton
              variant="outlined"
              onClick={() => setConfirmation("compact")}
              disabled={disabled}
            >
              {history.isCompacting ? "Compacting…" : "Compact database"}
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
            ? "Compact database?"
            : "Clean old history?"
        }
        content={
          confirmation === "compact"
            ? "Compaction returns unused SQLite pages to disk. It can pause database writes while it rebuilds a large local database."
            : `Remove ${cleanupCount} old workflow-history and completed-run records? Current workflows, assets, checkpoints, and active runs are not changed.`
        }
        confirmText={confirmation === "compact" ? "Compact" : "Clean"}
        cancelText="Cancel"
      />
    </>
  );
}
