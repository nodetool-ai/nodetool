/**
 * The Game flow's landing checklist, at the top of the agent panel
 * (game-prd § 4.4).
 *
 * Four lines and the failures: the graph that was built, the assets checked so
 * far, where the project was written, and whether Godot verified it. The rows
 * read the run's own results (`useGameRunSummary`), so they fill in while the
 * canvas runs rather than reporting a snapshot taken at build time.
 *
 * `Verified with Godot 4.3` shows only when the export node said
 * `verified: true` (criterion 7, D28). A server without a Godot binary says so
 * and hands over the folder and the zip; it never reports green from a
 * verification that was skipped.
 *
 * Nothing here fixes anything. The next steps open the folder, download the
 * zip, hand the project to the agent for a play-test, or run the graph again —
 * each one on the creator's click.
 */

import React, { memo } from "react";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  StatusPill,
  Text
} from "../../ui_primitives";
import type { BuildGameResult } from "../../../hooks/game/useBuildGame";
import type { GameRunSummary } from "./gameRunSummary";

export interface GameLandingChecklistProps {
  result: BuildGameResult;
  run: GameRunSummary;
  /** The Godot minor the chosen template targets, e.g. "4.3". */
  godot: string;
  /** Opens a `workspace-file` tab on `<directory>/project.godot`. */
  onOpenFolder: () => void;
  /** Downloads the `games/<slug>.zip` the export node wrote. */
  onDownload: () => void;
  /** Stages the agent's first turn and opens the project overview. */
  onPlayTest: () => void;
  /** Runs the graph again. */
  onRegenerate: () => void;
}

/** The message the agent panel opens with when the build did not come out clean. */
export const gameFailureMessage = (
  result: BuildGameResult,
  run: GameRunSummary
): string | null => {
  if (result.validationErrors.length > 0) {
    return [
      "The graph I just built does not validate:",
      ...result.validationErrors.map((error) => `- ${error}`),
      "",
      "Propose a fix and wait for me before changing the graph."
    ].join("\n");
  }
  if (result.issues.length > 0) {
    return [
      "The graph I just built validates, but part of it was never placed:",
      ...result.issues.map((issue) => `- ${issue}`),
      "",
      "That means slots go unfilled or no project is written. Propose a fix and wait for me."
    ].join("\n");
  }
  if (result.run.error !== null) {
    return [
      `The run did not start: ${result.run.error}`,
      "",
      "Propose a fix and wait for me before changing the graph."
    ].join("\n");
  }
  if (run.failures.length > 0) {
    return [
      "Some of the game's assets failed:",
      ...run.failures.map(
        (failure) =>
          `- ${failure.slotId ?? failure.nodeId}: ${failure.error}`
      ),
      "",
      "Propose a fix and wait for me before regenerating."
    ].join("\n");
  }
  return null;
};

const ChecklistInternal: React.FC<GameLandingChecklistProps> = ({
  result,
  run,
  godot,
  onOpenFolder,
  onDownload,
  onPlayTest,
  onRegenerate
}) => {
  const exported = run.directory !== null;
  const failure = gameFailureMessage(result, run);
  return (
    <FlexColumn gap={GAP.normal}>
      <Line
        done
        label="Graph built"
        detail={`${result.nodeCount} node${
          result.nodeCount === 1 ? "" : "s"
        } placed`}
      />
      <Line
        done={run.total > 0 && run.checked === run.total}
        label="Assets checked"
        detail={
          run.total === 0
            ? "This project keeps the template's own art"
            : `${run.checked} of ${run.total}`
        }
      />
      <Line
        done={exported}
        label="Exported"
        detail={run.directory ?? "Waiting for the export node"}
      />
      <Line
        done={run.verified}
        label={
          run.verified
            ? `Verified with Godot ${godot}`
            : `Godot not found on this server — open the folder in Godot ${godot} to verify`
        }
        detail={
          run.verified
            ? "The project opened and ran headlessly"
            : (run.verificationReason ?? "Not verified here")
        }
      />

      {run.failures.map((entry) => (
        <Line
          key={entry.nodeId}
          done={false}
          label={entry.slotId ?? entry.nodeId}
          detail={entry.error}
        />
      ))}

      {failure === null ? (
        <FlexRow gap={GAP.normal} align="center" wrap>
          <EditorButton
            variant="contained"
            onClick={onOpenFolder}
            disabled={!exported}
          >
            Open project folder
          </EditorButton>
          <EditorButton
            variant="outlined"
            onClick={onDownload}
            disabled={run.archive === null}
          >
            Download project
          </EditorButton>
          <EditorButton
            variant="outlined"
            onClick={onPlayTest}
            disabled={!exported}
          >
            Play-test with the agent
          </EditorButton>
          <EditorButton variant="text" onClick={onRegenerate}>
            Regenerate
          </EditorButton>
        </FlexRow>
      ) : (
        <AlertBanner
          severity="error"
          title="This needs a fix before it plays"
          action={
            <EditorButton variant="text" onClick={onRegenerate}>
              Regenerate
            </EditorButton>
          }
        >
          <Caption component="span">{failure.split("\n")[0]}</Caption>
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

interface LineProps {
  done: boolean;
  label: string;
  detail: string;
}

const Line: React.FC<LineProps> = ({ done, label, detail }) => (
  <FlexRow gap={GAP.normal} align="center">
    <StatusPill tone={done ? "done" : "failed"}>
      {done ? "done" : "todo"}
    </StatusPill>
    <Text size="small" component="span">
      {label}
    </Text>
    <Caption color="secondary">{detail}</Caption>
  </FlexRow>
);

export const GameLandingChecklist = memo(ChecklistInternal);
GameLandingChecklist.displayName = "GameLandingChecklist";

export default GameLandingChecklist;
