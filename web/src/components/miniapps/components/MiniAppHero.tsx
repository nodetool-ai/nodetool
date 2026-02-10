import React, { useMemo } from "react";
import { Theme } from "@mui/material/styles";
import {
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography
} from "@mui/material";
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

const MiniAppHero: React.FC<MiniAppHeroProps> = ({
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
  const progressSx = useMemo(
    () => ({
      backgroundColor: "transparent",
      "& .MuiLinearProgress-bar": {
        backgroundColor: (theme: Theme) => theme.vars.palette.c_highlight
      }
    }),
    []
  );
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
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={workflowsLoading}
            className="refresh-button"
          >
            Refresh
          </Button>
        </div>
      )}

      <div className="hero-status">
        {workflowsLoading && (
          <>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading workflows…</Typography>
          </>
        )}
        {runnerState === "running" && (
          <>
            <CircularProgress size={18} />
            <Typography variant="body2">
              {statusMessage || "Running workflow…"}
            </Typography>
          </>
        )}
        {runnerState === "idle" && statusMessage && (
          <Typography variant="body2" color="text.secondary">
            {statusMessage}
          </Typography>
        )}
        {progress && progress.total > 0 && (
          <LinearProgress
            variant="determinate"
            value={(progress.current / progress.total) * 100}
            sx={progressSx}
          />
        )}
      </div>
    </header>
  );
};

export default React.memo(MiniAppHero);
