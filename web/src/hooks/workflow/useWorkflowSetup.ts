/**
 * The Workflow flow's state, which lives on the workflow it produces
 * (PRD § 11.5, D19).
 *
 * `settings.setup` is one optional field on a bag the workflow already carries,
 * so a workflow saved before the flow existed reads stage `done` and opens as
 * the editor it always did (criterion 2). Every write merges — the brief as it
 * is typed (saved after a pause), then the category, then the plan — and
 * leaves the rest of `settings` untouched, because other surfaces keep their
 * own keys there.
 *
 * The flow is a function of what is on the document plus the live registry, so
 * any host — the New Project tab, a workflow tab — builds the same steps from a
 * workflow id and resumes at the same place.
 */

import { useCallback, useEffect } from "react";
import {
  readWorkflowSetup,
  writeWorkflowSetup,
  type WorkflowSetup,
  type WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";

/** A workflow that has no `settings.setup` is finished, not mid-flow. */
export const useWorkflowSetupStage = (workflowId: string): WorkflowSetupStage =>
  useWorkflowManager(
    (state) =>
      readWorkflowSetup(state.getWorkflow(workflowId)?.settings)?.stage ?? "done"
  );

/** The whole setup record, or null on a workflow that never went through it. */
export const useWorkflowSetupDocument = (
  workflowId: string
): WorkflowSetup | null =>
  useWorkflowManager(
    (state) => readWorkflowSetup(state.getWorkflow(workflowId)?.settings) ?? null
  );

export interface WorkflowSetupWriter {
  /**
   * Merge a patch into `settings.setup` and persist it now. Resolves once a
   * save that includes the patch has finished, and rejects when it fails.
   */
  setSetup: (patch: Partial<WorkflowSetup>) => Promise<void>;
  /**
   * Merge a typed edit into `settings.setup` at once and persist it after the
   * typing pauses. A failed save is reported as a notification, because no
   * caller is waiting on a keystroke.
   */
  editSetup: (patch: Partial<WorkflowSetup>) => void;
}

/** How long typing pauses before a text edit is saved. */
export const SETUP_EDIT_SAVE_DELAY_MS = 600;

/** Tell the creator that a setup write did not reach the server. */
export const reportSetupSaveError = (cause: unknown): void => {
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    content: `Could not save the workflow setup: ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  });
};

interface SaveQueue {
  save: () => Promise<void>;
  /** The save on the wire, if any. */
  inFlight: Promise<void> | null;
  /** The save waiting for `inFlight` to finish. It reads state when it starts. */
  queued: Promise<void> | null;
  /** The pending text-edit save. */
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One save queue per workflow, shared by every writer. The planner, the flow
 * and the build each hold a writer, and two saves in flight send the same
 * `expected_updated_at`, so the second one fails with a concurrency conflict.
 */
const saveQueues = new Map<string, SaveQueue>();

const queueFor = (workflowId: string, save: () => Promise<void>): SaveQueue => {
  const existing = saveQueues.get(workflowId);
  if (existing) {
    existing.save = save;
    return existing;
  }
  const created: SaveQueue = {
    save,
    inFlight: null,
    queued: null,
    timer: null
  };
  saveQueues.set(workflowId, created);
  return created;
};

const releaseIfIdle = (workflowId: string, queue: SaveQueue): void => {
  if (
    queue.inFlight === null &&
    queue.queued === null &&
    queue.timer === null &&
    saveQueues.get(workflowId) === queue
  ) {
    saveQueues.delete(workflowId);
  }
};

/**
 * Save what memory holds, after any save already on the wire. Changes made
 * before the queued save starts ride along with it, so a burst of writes
 * costs at most one save behind the current one.
 */
const flushQueue = (workflowId: string, queue: SaveQueue): Promise<void> => {
  if (queue.timer !== null) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
  if (queue.queued) {
    return queue.queued;
  }
  const previous = queue.inFlight ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      queue.queued = null;
      const saving = queue.save();
      queue.inFlight = saving;
      try {
        await saving;
      } finally {
        if (queue.inFlight === saving) {
          queue.inFlight = null;
        }
        releaseIfIdle(workflowId, queue);
      }
    });
  queue.queued = queued;
  return queued;
};

/** The store calls a workflow save needs. */
export type WorkflowSaveState = Pick<
  WorkflowManagerState,
  "getWorkflow" | "getNodeStore" | "saveWorkflow"
>;

/**
 * Save the workflow as it is when the save starts. The row's graph can be
 * behind the canvas — the build places nodes and then writes stage `done` — so
 * save what the editor holds when there is one, and the stored graph when
 * there is not.
 */
const saveCurrentWorkflow = async (
  state: WorkflowSaveState,
  workflowId: string
): Promise<void> => {
  const workflow =
    state.getNodeStore(workflowId)?.getState().getWorkflow() ??
    state.getWorkflow(workflowId);
  if (!workflow) {
    return;
  }
  await state.saveWorkflow(workflow);
};

/**
 * Save the workflow through its setup save queue, after any save already on
 * the wire. Writers outside the flow (the agent's setup tools, a file import)
 * use this, so their save does not race a flow save with the same
 * `expected_updated_at` and fail with a concurrency conflict.
 */
export const queueWorkflowSave = (
  state: WorkflowSaveState,
  workflowId: string
): Promise<void> =>
  flushQueue(
    workflowId,
    queueFor(workflowId, () => saveCurrentWorkflow(state, workflowId))
  );

/**
 * Write setup answers back onto the workflow.
 *
 * Every write goes through the manager's `updateWorkflow` at once, so the open
 * editor and the tab list see it, and then `saveWorkflow`, so a reload resumes
 * at the same step. Saves are serialized per workflow and coalesced: a typed
 * edit waits for a pause, and a stage change or another explicit choice saves
 * at once and carries any edit still waiting. A refused explicit save rejects
 * rather than resolving quietly: the shell puts the reason on the button, and
 * a stage that did not persist would otherwise strand the creator one refresh
 * later.
 */
export const useWorkflowSetupWriter = (
  workflowId: string
): WorkflowSetupWriter => {
  const store = useWorkflowManagerStore();

  // The save reads the workflow when it starts, not when it was asked for, so
  // a queued save carries every change made while the previous one was out.
  const save = useCallback(
    () => saveCurrentWorkflow(store.getState(), workflowId),
    [store, workflowId]
  );

  const apply = useCallback(
    (patch: Partial<WorkflowSetup>) => {
      const state = store.getState();
      const workflow = state.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} is not open.`);
      }
      state.updateWorkflow({
        ...workflow,
        settings: writeWorkflowSetup(workflow.settings, patch)
      });
    },
    [store, workflowId]
  );

  const setSetup = useCallback(
    async (patch: Partial<WorkflowSetup>) => {
      apply(patch);
      await flushQueue(workflowId, queueFor(workflowId, save));
    },
    [apply, save, workflowId]
  );

  const editSetup = useCallback(
    (patch: Partial<WorkflowSetup>) => {
      try {
        apply(patch);
      } catch (cause) {
        reportSetupSaveError(cause);
        return;
      }
      const queue = queueFor(workflowId, save);
      if (queue.timer !== null) {
        clearTimeout(queue.timer);
      }
      queue.timer = setTimeout(() => {
        queue.timer = null;
        flushQueue(workflowId, queue).catch(reportSetupSaveError);
      }, SETUP_EDIT_SAVE_DELAY_MS);
    },
    [apply, save, workflowId]
  );

  // An edit still waiting for its pause is saved when the writer goes away,
  // so leaving the flow mid-word does not drop the last characters.
  useEffect(
    () => () => {
      const queue = saveQueues.get(workflowId);
      if (queue?.timer != null) {
        flushQueue(workflowId, queue).catch(reportSetupSaveError);
      }
    },
    [workflowId]
  );

  return { setSetup, editSetup };
};
