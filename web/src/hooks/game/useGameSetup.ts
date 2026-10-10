/**
 * The Game flow's state, which lives on the workflow that carries it.
 *
 * `settings.game` is the record the headless `set_game_setup`, `design_game`
 * and `build_game` capabilities read and write, so a game designed by an agent
 * and one designed in this flow are the same document. Every write merges and
 * leaves the rest of `settings` alone, and goes through the workflow's one
 * save queue, so a design write and a typed edit never race each other.
 */

import { useCallback } from "react";
import {
  readGameSetup,
  writeGameSetup,
  type GameSetup,
  type GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  reportSetupSaveError,
  useWorkflowSettingsWriter
} from "../workflow/useWorkflowSetup";

/** The whole game record, or null on a workflow that never went through it. */
export const useGameSetupDocument = (workflowId: string): GameSetup | null =>
  useWorkflowManager(
    (state) => readGameSetup(state.getWorkflow(workflowId)?.settings) ?? null
  );

/** A workflow with no `settings.game` is not mid-flow. */
export const useGameSetupStage = (workflowId: string): GameSetupStage =>
  useWorkflowManager(
    (state) =>
      readGameSetup(state.getWorkflow(workflowId)?.settings)?.stage ?? "done"
  );

/** True once the workflow row is in the manager, whatever it holds. */
export const useGameWorkflowLoaded = (workflowId: string): boolean =>
  useWorkflowManager((state) => state.getWorkflow(workflowId) !== undefined);

export interface GameSetupWriter {
  /** Merge a patch and save it now. Rejects when the save fails. */
  setGame: (patch: Partial<GameSetup>) => Promise<void>;
  /** The same, for callers nobody awaits: a failure becomes a notification. */
  setGameQuietly: (patch: Partial<GameSetup>) => void;
  /** Merge a typed edit at once and save it after the typing pauses. */
  editGame: (patch: Partial<GameSetup>) => void;
}

export const useGameSetupWriter = (workflowId: string): GameSetupWriter => {
  const { write, edit } = useWorkflowSettingsWriter<Partial<GameSetup>>(
    workflowId,
    writeGameSetup
  );
  const setGameQuietly = useCallback(
    (patch: Partial<GameSetup>) => {
      write(patch).catch(reportSetupSaveError);
    },
    [write]
  );
  return { setGame: write, setGameQuietly, editGame: edit };
};
