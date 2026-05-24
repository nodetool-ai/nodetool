/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Text
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import {
  MAX_RUNS,
  MIN_RUNS,
  useRunSelectedNodes
} from "../../hooks/nodes/useRunSelectedNodes";

const styles = (theme: Theme) =>
  css({
    "&": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5)
    },
    ".stepper-control": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "var(--rounded-md)",
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".stepper-value": {
      minWidth: "1.5em",
      textAlign: "center",
      fontVariantNumeric: "tabular-nums"
    },
    ".run-button": {
      width: "100%",
      justifyContent: "center",
      gap: theme.spacing(1),
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      },
      "&.Mui-disabled": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        color: theme.vars.palette.action.disabled
      }
    }
  });

const RunSelectedNodesSectionInternal: React.FC = () => {
  const theme = useTheme();
  const { runSelectedNodes, isWorkflowRunning, runProgress } =
    useRunSelectedNodes();
  const [runs, setRuns] = useState(1);

  const clamp = (n: number) => Math.max(MIN_RUNS, Math.min(MAX_RUNS, n));

  const decrement = useCallback(() => setRuns((r) => clamp(r - 1)), []);
  const increment = useCallback(() => setRuns((r) => clamp(r + 1)), []);

  const handleRun = useCallback(() => {
    void runSelectedNodes(runs);
  }, [runSelectedNodes, runs]);

  const inSequence = runProgress !== null && runProgress.total > 1;
  const buttonDisabled = isWorkflowRunning;

  return (
    <div css={styles(theme)} className="run-selected-section">
      <Caption size="smaller" color="muted">
        Run selected nodes
      </Caption>
      <FlexRow gap={2} align="center" justify="space-between" fullWidth>
        <Text size="small">Runs</Text>
        <FlexRow gap={0} align="center" className="stepper-control">
          <EditorButton
            onClick={decrement}
            disabled={runs <= MIN_RUNS || isWorkflowRunning}
            aria-label="Decrease runs"
          >
            <RemoveIcon fontSize="small" />
          </EditorButton>
          <Text size="small" className="stepper-value">
            {runs}
          </Text>
          <EditorButton
            onClick={increment}
            disabled={runs >= MAX_RUNS || isWorkflowRunning}
            aria-label="Increase runs"
          >
            <AddIcon fontSize="small" />
          </EditorButton>
        </FlexRow>
      </FlexRow>
      <FlexColumn gap={0.5}>
        <EditorButton
          className="run-button"
          density="normal"
          onClick={handleRun}
          disabled={buttonDisabled}
          aria-label="Run selected nodes"
        >
          <ArrowForwardIcon fontSize="small" />
          <span>Run selected</span>
        </EditorButton>
        {inSequence ? (
          <Caption size="smaller" color="muted">
            {`Run ${runProgress!.current}/${runProgress!.total}`}
          </Caption>
        ) : null}
      </FlexColumn>
    </div>
  );
};

export const RunSelectedNodesSection = memo(RunSelectedNodesSectionInternal);
RunSelectedNodesSection.displayName = "RunSelectedNodesSection";

export default RunSelectedNodesSection;
