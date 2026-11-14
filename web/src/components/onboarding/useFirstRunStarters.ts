/**
 * The first-run starters on Home: a game, a storyboard and a template, each
 * created already filled in and opened on the step whose button produces
 * output on the default text model.
 *
 * - Game: a shipped inspiration brief, opened on the design step. The brief
 *   has a pinned design, so "Write the design" works even with no model.
 * - Storyboard: a brief and a genre, opened on the genre step, where
 *   "Generate screenplay" runs the Director.
 * - Template: a copy of a text-only example whose input is filled in and
 *   whose model is empty, so it takes the default language model. Run starts
 *   it.
 *
 * None of them needs an image or video key. Drawing stills or game art still
 * does, which is the media half of the plan's default-model item.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_NATIVE_GAME_TEMPLATE, NATIVE_GAME_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import { writeGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { FirstRunStarter } from "@nodetool-ai/analytics";

import { useCreateStoryboard } from "../../hooks/storyboard/useStoryboards";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { newStoryboardSetupDocument } from "../setup/storyboard/useStoryboardSetupFlow";
import { noteStarterSelected } from "../../lib/analytics";

/** The card starters. The first task is a chat, which the host sends. */
export type FirstRunCardId = Exclude<FirstRunStarter, "first_task">;

/**
 * The game brief. It must match a shipped chip for the default template
 * exactly, or there is no pinned design to fall back on.
 */
export const FIRST_RUN_GAME_CHIP =
  NATIVE_GAME_INSPIRATION_CHIPS.find(
    (chip) => chip.template === DEFAULT_NATIVE_GAME_TEMPLATE
  ) ?? NATIVE_GAME_INSPIRATION_CHIPS[0];

/** Written on the board and read into the Director prompt as prose. */
export const FIRST_RUN_STORYBOARD_GENRE = "Drama";

/**
 * A shipped example with one text input already filled in and one Agent node
 * whose model is empty, so it runs on the person's default language model.
 */
export const FIRST_RUN_TEMPLATE = {
  packageName: "nodetool-base",
  name: "Ad Copy in Three Registers"
} as const;

export interface FirstRunStarters {
  start: (id: FirstRunCardId) => Promise<void>;
  /** The starter being created, so the cards can wait while it is. */
  starting: FirstRunCardId | null;
}

export const useFirstRunStarters = (): FirstRunStarters => {
  const { t } = useTranslation();
  const [starting, setStarting] = useState<FirstRunCardId | null>(null);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const createStoryboard = useCreateStoryboard();
  const createWorkflow = useWorkflowManager((state) => state.create);

  const createGame = useCallback(async () => {
    const projectId = creationProjectId();
    const name = FIRST_RUN_GAME_CHIP.design.title;
    const created = await createWorkflow({
      name,
      description: "",
      tags: [],
      access: "private",
      project_id: projectId,
      settings: writeGameSetup(
        {},
        {
          stage: "template",
          brief: FIRST_RUN_GAME_CHIP.brief,
          template: FIRST_RUN_GAME_CHIP.template
        }
      )
    });
    openTab({ type: "workflow", ref: created.id, mode: "edit", title: name, projectId });
  }, [createWorkflow, openTab]);

  const createBoard = useCallback(async () => {
    const projectId = creationProjectId();
    const name = t("firstRun.storyboard.title");
    const created = await createStoryboard.mutateAsync({
      name,
      projectId,
      document: {
        ...newStoryboardSetupDocument(t("firstRun.storyboard.brief")),
        genre: FIRST_RUN_STORYBOARD_GENRE,
        setupStage: "genre"
      }
    });
    openTab({
      type: "storyboard",
      ref: created.id,
      mode: "edit",
      title: created.name,
      projectId: created.projectId
    });
  }, [createStoryboard, openTab, t]);

  const copyTemplate = useCallback(async () => {
    const projectId = creationProjectId();
    const copy = await createWorkflow(
      {
        name: FIRST_RUN_TEMPLATE.name,
        description: "",
        package_name: FIRST_RUN_TEMPLATE.packageName,
        tags: ["example"],
        access: "private",
        project_id: projectId
      },
      FIRST_RUN_TEMPLATE.packageName,
      FIRST_RUN_TEMPLATE.name
    );
    openTab({
      type: "workflow",
      ref: copy.id,
      mode: "edit",
      title: copy.name || FIRST_RUN_TEMPLATE.name,
      projectId
    });
  }, [createWorkflow, openTab]);

  const start = useCallback(
    async (id: FirstRunCardId) => {
      if (starting !== null) {
        return;
      }
      noteStarterSelected(id);
      setStarting(id);
      try {
        const create = { game: createGame, storyboard: createBoard, template: copyTemplate }[id];
        await create();
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: t("firstRun.startFailed", {
            error: error instanceof Error ? error.message : String(error)
          })
        });
      } finally {
        setStarting(null);
      }
    },
    [addNotification, copyTemplate, createBoard, createGame, starting, t]
  );

  return { start, starting };
};
