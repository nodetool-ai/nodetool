/**
 * Progress and generation-status surfaces with sample data, for the
 * `/preview/progress-states` screenshot route.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import {
  Caption,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ProgressBar,
  Surface,
  SPACING
} from "../ui_primitives";
import ExecutionTree from "../execution/ExecutionTree";
import { TodoSidebar } from "../chat/sidebar/TodoSidebar";
import PlanningUpdateDisplay from "../node/PlanningUpdateDisplay";
import RunGroupButton from "../node/RunGroupButton";
import { DownloadProgress } from "../hugging_face/DownloadProgress";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import type { ExecutionTreeState } from "../../hooks/useExecutionTreeState";

const TREE_STATE: ExecutionTreeState = {
  phase: "executing",
  planningContent: "",
  planningLog: [],
  logs: [],
  tasks: [
    {
      id: "t1",
      name: "Collect reference images",
      status: "completed",
      duration: 42,
      steps: [],
      expanded: false,
      toolCalls: []
    },
    {
      id: "t2",
      name: "Write the shot list",
      status: "running",
      startedAt: Date.now() - 8000,
      steps: [],
      expanded: false,
      toolCalls: []
    },
    {
      id: "t3",
      name: "Render the storyboard",
      status: "waiting",
      steps: [],
      expanded: false,
      toolCalls: []
    }
  ]
};

const DOWNLOAD_ID = "black-forest-labs/FLUX.1-schnell";
const PENDING_ID = "stabilityai/stable-diffusion-xl-base-1.0";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children
}) => (
  <Surface sx={{ p: SPACING.xl, minWidth: 0 }}>
    <FlexColumn gap={SPACING.lg}>
      <Caption color="secondary">{title}</Caption>
      {children}
    </FlexColumn>
  </Surface>
);

const PreviewProgressStates: React.FC = () => {
  const { t } = useTranslation("translation", {
    keyPrefix: "batch2_14.progress"
  });
  const theme = useTheme();
  const [seeded, setSeeded] = useState(false);
  const treeState: ExecutionTreeState = {
    ...TREE_STATE,
    tasks: TREE_STATE.tasks.map((task, index) => ({
      ...task,
      name: t(
        ["taskCollectImages", "taskWriteShotList", "taskRenderStoryboard"][
          index
        ] ?? "taskCollectImages"
      )
    }))
  };

  useEffect(() => {
    const now = Date.now();
    useModelDownloadStore.setState({
      wsConnectionState: "connected",
      downloads: {
        [DOWNLOAD_ID]: {
          id: DOWNLOAD_ID,
          status: "progress",
          downloadedBytes: 9_400_000_000,
          totalBytes: 23_800_000_000,
          totalFiles: 12,
          downloadedFiles: 5,
          speed: 48_000_000,
          speedHistory: [],
          lastUpdated: now
        },
        [PENDING_ID]: {
          id: PENDING_ID,
          status: "start",
          downloadedBytes: 0,
          totalBytes: 0,
          speed: null,
          speedHistory: [],
          lastUpdated: now
        }
      }
    });
    setSeeded(true);
  }, []);

  return (
    <FlexColumn
      data-preview="progress-states"
      gap={SPACING.xl}
      sx={{
        p: SPACING.xxl,
        minHeight: "100vh",
        bgcolor: theme.vars.palette.background.default
      }}
    >
      <FlexRow
        gap={SPACING.xl}
        align="flex-start"
        sx={{ "& > *": { flex: 1 } }}
      >
        <Section title={t("spinners")}>
          <FlexRow gap={SPACING.xxl} align="center">
            <LoadingSpinner size="small" text={t("loadingVersions")} />
            <LoadingSpinner size="medium" text={t("loadingModels")} />
            <RunGroupButton
              isWorkflowRunning={true}
              state="running"
              onClick={() => undefined}
            />
          </FlexRow>
        </Section>
        <Section title={t("progressBars")}>
          <ProgressBar value={42} label="clip-07.mp4" />
          <ProgressBar
            value={0}
            progressVariant="indeterminate"
            showValue={false}
          />
        </Section>
      </FlexRow>
      <FlexRow
        gap={SPACING.xl}
        align="flex-start"
        sx={{ "& > *": { flex: 1 } }}
      >
        <Section title={t("executionPlan")}>
          <ExecutionTree state={treeState} onToggleTask={() => undefined} />
        </Section>
        <Section title={t("agentTasks")}>
          <FlexColumn sx={{ height: 200 }}>
            <TodoSidebar
              todos={[
                { content: t("todoReadBrief"), status: "completed" },
                { content: t("todoDraftShots"), status: "in_progress" },
                { content: t("todoPickLook"), status: "pending" }
              ]}
            />
          </FlexColumn>
          <PlanningUpdateDisplay
            planningUpdate={{
              type: "planning_update",
              phase: "planning",
              status: t("running"),
              content: t("planningContent")
            }}
          />
        </Section>
      </FlexRow>
      <Section title={t("modelDownloads")}>
        {seeded && <DownloadProgress name={DOWNLOAD_ID} />}
        {seeded && <DownloadProgress name={PENDING_ID} />}
      </Section>
    </FlexColumn>
  );
};

export default PreviewProgressStates;
