/**
 * The Game flow's state, which lives on the workflow it produces
 * (game-prd § 5.1, D25).
 *
 * `settings.game` is a second optional bag beside `settings.setup`, so a
 * workflow saved before this flow existed reads stage `done` and opens as the
 * node editor it always did (criterion 2). Every write merges — the brief as
 * it is typed, then the template, then the design — and leaves the rest of
 * `settings` untouched, `setup` included.
 *
 * The flow is a function of what is on the document plus the live registry, so
 * any host builds the same steps from a workflow id and resumes at the same
 * place. This mirrors `useWorkflowSetup` field for field; only the reader and
 * the writer differ.
 */

import { useCallback } from "react";
import {
  readGameSetup,
  writeGameSetup,
  type GameSetup,
  type GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";

/** A workflow that has no `settings.game` is finished, not mid-flow. */
export const useGameSetupStage = (workflowId: string): GameSetupStage =>
  useWorkflowManager(
    (state) =>
      readGameSetup(state.getWorkflow(workflowId)?.settings)?.stage ?? "done"
  );

/** The whole game record, or null on a workflow that never went through it. */
export const useGameSetupDocument = (workflowId: string): GameSetup | null =>
  useWorkflowManager(
    (state) => readGameSetup(state.getWorkflow(workflowId)?.settings) ?? null
  );

export interface GameSetupWriter {
  /** Merge a patch into `settings.game` and persist it. */
  setGame: (patch: Partial<GameSetup>) => Promise<void>;
}

/**
 * Write setup answers back onto the workflow.
 *
 * The write goes through the manager's `updateWorkflow` (so the open editor and
 * the tab list see it at once) and then `saveWorkflow` (so a reload resumes at
 * the same step). A refused save rejects rather than resolving quietly: the
 * shell puts the reason on the button, and a stage that did not persist would
 * otherwise strand the creator one refresh later.
 */
export const useGameSetupWriter = (workflowId: string): GameSetupWriter => {
  const store = useWorkflowManagerStore();

  const setGame = useCallback(
    async (patch: Partial<GameSetup>) => {
      const state = store.getState();
      const workflow = state.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} is not open.`);
      }
      const settings = writeGameSetup(workflow.settings, patch);
      state.updateWorkflow({ ...workflow, settings });
      // The row's graph can be behind the canvas — the build places nodes and
      // then writes stage `done` — so save what the editor holds when there is
      // one, and the stored graph when there is not.
      const live = state.getNodeStore(workflowId)?.getState().getWorkflow();
      await state.saveWorkflow({ ...(live ?? workflow), settings });
    },
    [store, workflowId]
  );

  return { setGame };
};
