/**
 * Where the Game flow lands (game-prd § 4.4): the node editor's agent panel,
 * with the checklist at the top of it.
 *
 * The panel is the canvas chat dock the node editor renders
 * (`panels/FloatingToolBar` → `ConversationOverlay`), so this mounts there and
 * gates itself on the document: a workflow whose `settings.game` reads stage
 * `done` and carries the build record `useBuildGame` wrote. Every other
 * workflow — one that never went through the flow, one still mid-flow, one
 * whose graph was placed by hand — renders nothing.
 *
 * The rows themselves come from the run (`useGameRunSummary`), so they fill in
 * while the canvas runs. This component only supplies the four next steps, and
 * none of them changes the graph on its own: they open the folder, hand over
 * the zip, give the project to the agent, or run what is already there.
 */

import React, { memo, useCallback, useMemo } from "react";

import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { BASE_URL } from "../../../stores/BASE_URL";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../../lib/tools/frontendToolRuntimeState";
import { useCurrentWorkspace } from "../../../hooks/useCurrentWorkspace";
import { useOpenProject, useProjectSummaries } from "../../../hooks/useProjects";
import { useGameSetupDocument } from "../../../hooks/game/useGameSetup";
import { useGameTemplates } from "../../../hooks/game/useGameTemplates";
import { stageProjectFirstTurn } from "../../projects/projectAgent";
import { GameLandingChecklist } from "./GameLandingChecklist";
import { useGameRunSummary } from "./gameRunSummary";
import { gameBuildResult, readGameBuild } from "./gameExtras";
import {
  gameArchiveDownloadPath,
  gamePlayTestTurn,
  gameProjectFileRef
} from "./nextSteps";

/** The Godot minor a template targets when its manifest has not loaded yet. */
const DEFAULT_GODOT = "4.3";

export interface GameLandingPanelProps {
  workflowId: string;
}

const GameLandingPanelInternal: React.FC<GameLandingPanelProps> = ({
  workflowId
}) => {
  const game = useGameSetupDocument(workflowId);
  const build = readGameBuild(game);
  const run = useGameRunSummary(workflowId);
  const { data: templates } = useGameTemplates();
  const { workspaceId } = useCurrentWorkspace();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  // The project the workflow's tab belongs to, so the play-test hand-over goes
  // to that project's agent rather than to whichever project is active.
  const projectId = useWorkspaceTabsStore(
    (state) =>
      state.tabs.find((tab) => tab.type === "workflow" && tab.ref === workflowId)
        ?.projectId ?? null
  );
  const { data: projects } = useProjectSummaries();
  const openProject = useOpenProject();

  const godot =
    templates?.find((entry) => entry.id === game?.template)?.godot ??
    DEFAULT_GODOT;

  const directory = run.directory;
  const archive = run.archive;

  const handleOpenFolder = useCallback(() => {
    if (workspaceId === undefined || directory === null) {
      return;
    }
    openTab({
      type: "workspace-file",
      ref: gameProjectFileRef(workspaceId, directory),
      mode: "view",
      title: "project.godot"
    });
  }, [directory, openTab, workspaceId]);

  const handleDownload = useCallback(() => {
    if (workspaceId === undefined || archive === null) {
      return;
    }
    window.open(
      `${BASE_URL}${gameArchiveDownloadPath(workspaceId, archive)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [archive, workspaceId]);

  const handlePlayTest = useCallback(() => {
    const design = game?.design;
    // A summary wraps the row; the overview takes the row itself.
    const project = projects?.find(
      (entry) => entry.project.id === projectId
    )?.project;
    if (!design || directory === null || !project) {
      return;
    }
    // Staged, then the overview opened — the same order `handleStart` uses on
    // the New Project surface, because only the project's own panel can send
    // the turn and it has to be waiting there before that panel mounts (D29).
    stageProjectFirstTurn(project.id, gamePlayTestTurn(design, directory));
    void openProject(project);
  }, [directory, game?.design, openProject, projectId, projects]);

  const handleRegenerate = useCallback(() => {
    void FrontendToolRegistry.call(
      "ui_run_workflow",
      { workflow_id: workflowId, params: {} },
      `game-regenerate-${Date.now()}`,
      { getState: getFrontendToolRuntimeState }
    );
  }, [workflowId]);

  const result = useMemo(
    () => (build === null ? null : gameBuildResult(build)),
    [build]
  );

  if (game?.stage !== "done" || result === null) {
    return null;
  }

  return (
    <GameLandingChecklist
      result={result}
      run={run}
      godot={godot}
      onOpenFolder={handleOpenFolder}
      onDownload={handleDownload}
      onPlayTest={handlePlayTest}
      onRegenerate={handleRegenerate}
    />
  );
};

export const GameLandingPanel = memo(GameLandingPanelInternal);
GameLandingPanel.displayName = "GameLandingPanel";

export default GameLandingPanel;
