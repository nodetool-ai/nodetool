/** @jsxImportSource @emotion/react */
import { memo, useState } from "react";
import { trpc } from "../../trpc/client";
import { Text, FlexColumn, FlexRow, NavButton, NodeTextField } from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import DeleteIcon from "@mui/icons-material/Delete";
import CircularProgress from "@mui/material/CircularProgress";

const DatabaseSettingsMenu = () => {
  const theme = useTheme();
  const addNotification = useNotificationStore((state) => state.addNotification);
  
  const { data: stats, isLoading, refetch } = trpc.database.stats.useQuery();
  const clearJobsMutation = trpc.database.clearJobs.useMutation();
  const clearVersionsMutation = trpc.database.clearWorkflowVersions.useMutation();

  const [daysToKeep, setDaysToKeep] = useState("30");
  const [versionsToKeep, setVersionsToKeep] = useState("50");

  const handleClearJobs = async () => {
    if (!window.confirm(`Are you sure you want to delete jobs older than ${daysToKeep} days?`)) return;
    try {
      const res = await clearJobsMutation.mutateAsync({ daysToKeep: Number(daysToKeep) });
      addNotification({ type: "success", content: `Deleted ${res.deletedJobs} jobs`, alert: true });
      refetch();
    } catch (e) {
      addNotification({ type: "error", content: "Failed to clear jobs", alert: true });
    }
  };

  const handleClearVersions = async () => {
    if (!window.confirm(`Are you sure you want to keep only the latest ${versionsToKeep} versions per workflow?`)) return;
    try {
      const res = await clearVersionsMutation.mutateAsync({ keepCount: Number(versionsToKeep) });
      addNotification({ type: "success", content: `Deleted ${res.deletedVersions} versions`, alert: true });
      refetch();
    } catch (e) {
      addNotification({ type: "error", content: "Failed to clear versions", alert: true });
    }
  };

  return (
    <div className="remote-settings-content" css={getSharedSettingsStyles(theme)}>
      <div className="settings-main-content">
        <Text size="giant">Database Management</Text>
        
        <div className="settings-section">
          <Text size="bigger" id="database-stats">Database Statistics</Text>
          {isLoading ? <CircularProgress size={20} /> : (
            <FlexColumn gap={1}>
              <Text>Workflow Versions: {stats?.workflowVersions.count} (~{stats?.workflowVersions.sizeMB} MB)</Text>
              <Text>Jobs: {stats?.jobs.count} (~{stats?.jobs.sizeMB} MB)</Text>
              <Text>Run Events: {stats?.runEvents.count} (~{stats?.runEvents.sizeMB} MB)</Text>
            </FlexColumn>
          )}
        </div>

        <div className="settings-section">
          <Text size="bigger" id="cleanup-jobs">Job History</Text>
          <Text className="description" sx={{ mb: 2 }}>
            Clear old job executions and logs to free up space.
          </Text>
          <FlexRow align="flex-end" gap={2}>
            <NodeTextField
              label="Days to Keep"
              type="number"
              value={daysToKeep}
              onChange={(e) => setDaysToKeep(e.target.value)}
              sx={{ width: 120 }}
            />
            <NavButton
              icon={<DeleteIcon />}
              label="Clear Old Jobs"
              onClick={handleClearJobs}
              color="error"
              disabled={clearJobsMutation.isPending}
              sx={{ ml: 2, padding: "0.5em 1em" }}
            />
          </FlexRow>
        </div>

        <div className="settings-section">
          <Text size="bigger" id="cleanup-versions">Workflow Versions</Text>
          <Text className="description" sx={{ mb: 2 }}>
            Clear old workflow autosaves and manual versions, keeping the latest N versions per workflow.
          </Text>
          <FlexRow align="flex-end" gap={2}>
            <NodeTextField
              label="Versions to Keep"
              type="number"
              value={versionsToKeep}
              onChange={(e) => setVersionsToKeep(e.target.value)}
              sx={{ width: 120 }}
            />
            <NavButton
              icon={<DeleteIcon />}
              label="Clear Old Versions"
              onClick={handleClearVersions}
              color="error"
              disabled={clearVersionsMutation.isPending}
              sx={{ ml: 2, padding: "0.5em 1em" }}
            />
          </FlexRow>
        </div>
      </div>
    </div>
  );
};

export default memo(DatabaseSettingsMenu);
