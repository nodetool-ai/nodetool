import React, { memo } from "react";
import { Theme } from "@mui/material/styles";
import {
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  SelectChangeEvent
} from "@mui/material";
import { EditorButton, LoadingSpinner, Text } from "../../ui_primitives";
import RefreshIcon from "@mui/icons-material/Refresh";

import { Workflow } from "../../../stores/ApiTypes";
import { WorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { MiniAppProgress } from "../types";

type WorkflowRunnerState = ReturnType<WorkflowRunnerStore["getState"]>;
type RunnerState = WorkflowRunnerState["state"];

interface MiniAppHeroProps {
  workflows?: Workflow[];
  selectedWorkflowId: string | "";
  onWorkflowChange: (event: SelectChangeEvent<string>) => void;
  onRefresh: () => void;
  workflowsLoading: boolean;
  runnerState: RunnerState;
  statusMessage: string | null;
  progress: MiniAppProgress | null;
  showWorkflowControls?: boolean;
}

const MiniAppHero: React.FC<MiniAppHeroProps> = memo(({
  workflows,
  selectedWorkflowId,
  onWorkflowChange,
  onRefresh,
  workflowsLoading,
  runnerState,
  statusMessage,
  progress,
  showWorkflowControls = true
}) => {
  return (
    <header className="hero glass-card">
      {showWorkflowControls && (
        <div className="hero-controls">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="workflow-select-label">Workflow</InputLabel>
            <Select
              labelId="workflow-select-label"
              label="Workflow"
              value={selectedWorkflowId}
              onChange={onWorkflowChange}
              disabled={
                workflowsLoading || !workflows || workflows.length === 0
              }
            >
              {workflows?.map((workflow) => (
                <MenuItem value={workflow.id} key={workflow.id}>
                  {workflow.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <EditorButton
            variant="outlined"
            density="compact"
            onClick={onRefresh}
            disabled={workflowsLoading}
            className="refresh-button"
          >
            <RefreshIcon sx={{ fontSize: "1em", mr: 0.5 }} />
            Refresh
          </EditorButton>
        </div>
      )}

      <div className="hero-status">
        {workflowsLoading && (
          <>
            <LoadingSpinner size="small" inline />
            <Text size="small">Loading workflows…</Text>
          </>
        )}
        {runnerState === "running" && (
          <>
            <LoadingSpinner size="small" inline />
            <Text size="small">
              {statusMessage || "Running workflow…"}
            </Text>
          </>
        )}
        {runnerState === "idle" && statusMessage && (
          <Text size="small" color="secondary">
            {statusMessage}
          </Text>
        )}
        {progress && progress.total > 0 && (
          <LinearProgress
            variant="determinate"
            value={(progress.current / progress.total) * 100}
            sx={{
              backgroundColor: "transparent",
              "& .MuiLinearProgress-bar": {
                backgroundColor: (theme: Theme) =>
                  theme.vars.palette.c_highlight
              }
            }}
          />
        )}
      </div>
    </header>
  );
});

MiniAppHero.displayName = 'MiniAppHero';

export default MiniAppHero;
