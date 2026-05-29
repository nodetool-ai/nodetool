/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Caption,
  FlexColumn,
  FlexRow,
  ShortcutHint,
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
      padding: `${theme.spacing(1.5)} ${theme.spacing(2.5)} ${theme.spacing(2)}`,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.25),
      backgroundColor: theme.vars.palette.background.default
    },
    ".runs-row": {
      width: "100%"
    },
    ".runs-label": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary
    },
    ".stepper-control": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "var(--rounded-md)",
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5),
      backgroundColor: "transparent"
    },
    ".stepper-control .MuiButtonBase-root": {
      borderRadius: "var(--rounded-sm)",
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.06)"
      }
    },
    ".stepper-value": {
      minWidth: "1.5em",
      textAlign: "center",
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },
    ".run-button": {
      width: "100%",
      justifyContent: "center",
      gap: theme.spacing(1),
      padding: `${theme.spacing(1.25)} ${theme.spacing(1.5)}`,
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      fontSize: theme.fontSizeNormal,
      fontWeight: 500,
      borderRadius: "var(--rounded-md)",
      transition: "background-color 120ms ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      },
      "&.Mui-disabled": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        color: theme.vars.palette.action.disabled
      }
    },
    ".run-button .play-icon": {
      fontSize: "1.125rem"
    },
    ".run-button .run-shortcut": {
      marginLeft: "auto",
      opacity: 0.85
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
      <FlexRow
        gap={2}
        align="center"
        justify="space-between"
        fullWidth
        className="runs-row"
      >
        <span className="runs-label">Runs</span>
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
          <PlayArrowIcon className="play-icon" />
          <span>Run selected nodes</span>
          <ShortcutHint className="run-shortcut" shortcut={["⌘", "Enter"]} />
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
