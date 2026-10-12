/**
 * Progress and generation-status surfaces with sample data, for the
 * `/preview/progress-states` screenshot route.
 */

import React, { useEffect, useState } from "react";
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
  const theme = useTheme();
  const [seeded, setSeeded] = useState(false);

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
      <FlexRow gap={SPACING.xl} align="flex-start" sx={{ "& > *": { flex: 1 } }}>
        <Section title="Spinners">
          <FlexRow gap={SPACING.xxl} align="center">
            <LoadingSpinner size="small" text="Loading versions" />
            <LoadingSpinner size="medium" text="Loading models" />
            <RunGroupButton
              isWorkflowRunning={true}
              state="running"
              onClick={() => undefined}
            />
          </FlexRow>
        </Section>
        <Section title="Progress bars">
          <ProgressBar value={42} label="clip-07.mp4" />
          <ProgressBar
            value={0}
            progressVariant="indeterminate"
            showValue={false}
          />
        </Section>
      </FlexRow>
      <FlexRow gap={SPACING.xl} align="flex-start" sx={{ "& > *": { flex: 1 } }}>
        <Section title="Execution plan">
          <ExecutionTree state={TREE_STATE} onToggleTask={() => undefined} />
        </Section>
        <Section title="Agent tasks">
          <FlexColumn sx={{ height: 200 }}>
            <TodoSidebar
              todos={[
                { content: "Read the brief", status: "completed" },
                { content: "Draft six shots", status: "in_progress" },
                { content: "Pick a look", status: "pending" }
              ]}
            />
          </FlexColumn>
          <PlanningUpdateDisplay
            planningUpdate={{
              type: "planning_update",
              phase: "planning",
              status: "Running",
              content: "Splitting the brief into tasks"
            }}
          />
        </Section>
      </FlexRow>
      <Section title="Model downloads">
        {seeded && <DownloadProgress name={DOWNLOAD_ID} />}
        {seeded && <DownloadProgress name={PENDING_ID} />}
      </Section>
    </FlexColumn>
  );
};

export default PreviewProgressStates;
