/**
 * The storyboard flow's config: the one place that maps a board's
 * `setupStage` onto a step (PRD § 6.4, § 7.1–7.3).
 *
 * Everything the flow needs is on the document, so any host — the New Project
 * tab, a workspace storyboard tab, a Studio page — builds the same config from
 * a board id and gets the same four steps back. `done` maps to no step: the
 * board belongs to the editor from there on (D3).
 */

import {
  createElement,
  useCallback,
  useMemo,
  useRef,
  type ReactNode
} from "react";
import type {
  StoryboardDocumentSchema,
  StoryboardSetupStage
} from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { Text } from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDirectScreenplay } from "../../../hooks/storyboard/useDirectScreenplay";
import { openPageTab } from "../../workspace/openPageTab";
import type { SetupFlowConfig, SetupStep } from "../types";
import { GenreStep } from "./GenreStep";
import { IdeaStep } from "./IdeaStep";
import { LookStep, useLookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";

/**
 * A board's stage, with the field's absence read as `done` — an old board has
 * no stage and opens as the editor, as it always did (PRD § 6.4).
 */
export const useStoryboardSetupStage = (
  boardId: string
): StoryboardSetupStage =>
  useStoryboardStore((state) => state.boards[boardId]?.setupStage ?? "done");

/**
 * The document a board created from an entry card starts life with: the typed
 * prompt as the brief, the stage at `idea` (PRD § 6.1). Written at create time
 * rather than patched afterwards, so the server copy the flow then loads is
 * already the one the creator asked for.
 */
export const newStoryboardSetupDocument = (
  brief: string
): StoryboardDocumentSchema => ({
  screenplay: null,
  shots: [],
  brief,
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "idea",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null
});

/** A stable identity for a step action that is not this phase's to implement. */
const noop = (): void => {};

/**
 * The flow's name, above the stepper. Each step body carries its own heading
 * and subline (PRD § 7.1–7.3), so this says what is being made and no more.
 */
const FLOW_LABELS = { title: "Storyboard" } as const;

/**
 * How many shots the Director is asked for from setup. The board's own Direct
 * control offers a number; the flow has no such field, so it asks for the same
 * count the board defaults to.
 */
const SETUP_SHOT_COUNT = 6;

export interface StoryboardSetupFlowOptions {
  boardId: string;
  /**
   * Runs after the last step writes stage `done` — the host's cue to show the
   * board it just built (open its tab, navigate to it).
   */
  onFinish?: () => void;
  /**
   * Runs when the creator leaves the review step, before the look step.
   *
   * Studio extracts the board's linked script here (PRD D9, criterion 6): the
   * words come from the screenplay the creator actually reviewed, not from the
   * Director's first draft, and extracting at the prompt would have used the
   * draft. Hosts with no linked script pass nothing.
   */
  onReviewed?: () => void | Promise<void>;
}

export const useStoryboardSetupFlow = ({
  boardId,
  onFinish,
  onReviewed
}: StoryboardSetupFlowOptions): SetupFlowConfig<StoryboardSetupStage> => {
  const stage = useStoryboardSetupStage(boardId);
  const setSetup = useStoryboardStore((state) => state.setSetup);
  // The two values a step writes before its button means anything. Read off
  // the document, so the button follows what the step actually wrote.
  const brief = useStoryboardStore(
    (state) => state.boards[boardId]?.brief ?? ""
  );
  const genre = useStoryboardStore(
    (state) => state.boards[boardId]?.genre ?? ""
  );
  const { direct, directing, error: directError } = useDirectScreenplay();
  // The reason a refused run gives arrives as state, one render after the
  // call resolves, so the step's own closure cannot see it. Mirror it and read
  // the mirror; when the render has not landed yet the throw still names the
  // step that failed.
  const directErrorRef = useRef<string | null>(null);
  directErrorRef.current = directError;

  const look = useLookStep(boardId);

  const onStageChange = useCallback(
    (next: StoryboardSetupStage) => setSetup(boardId, { stage: next }),
    [boardId, setSetup]
  );

  // PRD § 7.1: the tutorial alternative is the existing tutorials entry, which
  // opens as a workspace tab from wherever the flow is hosted.
  const openTutorial = useCallback(() => openPageTab("tutorials"), []);

  const finish = useCallback(() => {
    setSetup(boardId, { stage: "done" });
    onFinish?.();
  }, [boardId, onFinish, setSetup]);

  const steps = useMemo<SetupStep<StoryboardSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        render: () =>
          createElement(IdeaStep, {
            boardId,
            // The blank escape hatch and the last step land in the same
            // place: stage `done` and the board (PRD § 7.1).
            onStartBlank: finish,
            onOpenTutorial: openTutorial
          })
      },
      {
        // Genre and review are both step 2, so they collapse to one stepper
        // entry (PRD § 6.2).
        stage: "genre",
        label: "Story",
        primaryLabel: "Review your screenplay",
        canAdvance: genre.length > 0,
        pending: directing,
        render: () => createElement(GenreStep, { boardId }),
        // The Director runs here, and a refused run must leave the creator on
        // genre with the reason on the button (PRD § 7.2). The hook resolves
        // `false` rather than rejecting — it also drives the board's own
        // Direct button — so the failure is turned into the throw the shell
        // reads.
        onAdvance: async () => {
          const directed = await direct(boardId, SETUP_SHOT_COUNT);
          if (!directed) {
            throw new Error(
              directErrorRef.current ??
                "The Director did not return a screenplay."
            );
          }
        }
      },
      {
        stage: "review",
        label: "Story",
        primaryLabel: "Continue to storyboard",
        render: () => createElement(ReviewStep, { boardId }),
        onAdvance: onReviewed
      },
      {
        stage: "look",
        label: "Storyboard",
        primaryLabel: "Generate your storyboard",
        canAdvance: look.canAdvance,
        primaryDetail: look.primaryDetail,
        render: () =>
          createElement(LookStep, {
            boardId,
            // `Add your own style` is P5's; until it exists the tile says so
            // rather than accepting a click and doing nothing.
            onAddOwnStyle: noop,
            addOwnDisabled: true,
            addOwnDisabledReason: "Custom styles ship in phase P5."
          }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (PRD § 7.3, D3); the host opens the board once the jobs are
        // away.
        onAdvance: async () => {
          await look.generate();
          onFinish?.();
        }
      }
    ],
    [
      boardId,
      brief,
      direct,
      directing,
      finish,
      genre,
      look,
      onFinish,
      onReviewed,
      openTutorial
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};
