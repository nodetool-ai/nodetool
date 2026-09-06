/**
 * The storyboard flow's config: the one place that maps a board's
 * `setupStage` onto a step (PRD § 6.4, § 7.1–7.3).
 *
 * Everything the flow needs is on the document, so any host — the New Project
 * tab, a workspace storyboard tab, a Studio page — builds the same config from
 * a board id and gets the same four steps back. `done` maps to no step: the
 * board belongs to the editor from there on (D3).
 *
 * The flow owns the one `useDirectScreenplay` instance the whole of step 2
 * runs on. The review step's `Rewrite from brief` is the same call as the
 * genre step's button, so the shell has to see that wait too — otherwise the
 * creator can leave a screenplay that is being replaced under them (F2).
 */

import { createElement, useCallback, useMemo } from "react";
import type {
  StoryboardDocumentSchema,
  StoryboardSetupStage
} from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDirectScreenplay } from "../../../hooks/storyboard/useDirectScreenplay";
import { useImportSource } from "../../../hooks/storyboard/useImportSource";
import { openPageTab } from "../../workspace/openPageTab";
import type { SetupFlowConfig, SetupStep } from "../types";
import { GenreStep } from "./GenreStep";
import { IdeaStep } from "./IdeaStep";
import { LookStep, useLookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";
import {
  DEFAULT_SETUP_SHOT_COUNT,
  directionFingerprint,
  keepPreviousScreenplay,
  setSetupShotCount,
  useDirectedFrom,
  useSetupShotCount
} from "./setupChoices";

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

/**
 * The flow's name, above the stepper. Each step body carries its own heading
 * and subline (PRD § 7.1–7.3), so this says what is being made and no more.
 */
const FLOW_LABELS = { title: "Storyboard" } as const;

/** What the Director is allowed to answer with, for the cost estimate. */
const DIRECTOR_MAX_OUTPUT_TOKENS = 8192;

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
  // The values a step writes before its button means anything. Read off the
  // document, so the button follows what the step actually wrote.
  const brief = useStoryboardStore(
    (state) => state.boards[boardId]?.brief ?? ""
  );
  const genre = useStoryboardStore(
    (state) => state.boards[boardId]?.genre ?? ""
  );
  const shots = useStoryboardStore((state) => state.boards[boardId]?.shots);
  const directorModel = useStoryboardStore(
    (state) => state.boards[boardId]?.directorModel ?? null
  );
  // The reason is read from the ref, not from `error`: the state lands a
  // render after `direct` resolves, and the step's own closure runs first.
  const {
    direct,
    directing,
    error: directError,
    errorRef: directErrorRef,
    usedFallback,
    acceptFallback
  } = useDirectScreenplay();
  const imported = useImportSource(boardId);
  // The Director's length decides what the run writes and what it costs, so
  // it is a field on the board rather than component state a remount drops
  // (PRD § 7.7, F17).
  const shotCount = useSetupShotCount(boardId);
  const directedFrom = useDirectedFrom(boardId);
  const setShotCount = useCallback(
    (count: number) => setSetupShotCount(boardId, count),
    [boardId]
  );

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

  const hasScreenplay = (shots?.length ?? 0) > 0;
  // What the run would be asked for now. A screenplay written from exactly
  // these inputs is the screenplay the button would produce, so the step
  // continues to it instead of spending on the same answer twice (F15).
  const fingerprint = useMemo(
    () =>
      directionFingerprint({
        brief,
        genre,
        shotCount,
        modelId: directorModel?.id ?? "",
        importKind: imported?.kind ?? "none"
      }),
    [brief, directorModel?.id, genre, imported?.kind, shotCount]
  );
  const upToDate = hasScreenplay && directedFrom === fingerprint;

  /**
   * Run the Director, keeping the screenplay it replaces so the review step
   * can put it back (F15). What the run was answering is recorded by the run
   * itself, so the UI and the headless path cannot disagree about it.
   */
  const runDirector = useCallback(
    async (requestedShots: number): Promise<boolean> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      keepPreviousScreenplay(boardId, board?.screenplay ?? null);
      return direct(boardId, requestedShots);
    },
    [boardId, direct]
  );

  // The review step's own rewrite. It asks for the shot count the board
  // already has rather than resetting the piece's length.
  const rewrite = useCallback(() => {
    const board = useStoryboardStore.getState().getBoard(boardId);
    void runDirector(board?.shots.length ?? shotCount);
  }, [boardId, runDirector, shotCount]);

  // Every shot the creator is about to pay to render needs something to
  // render. An empty action line reaches the prompt as nothing at all (F20).
  const emptyShots = (shots ?? []).filter(
    (shot) => shot.action.trim().length === 0
  ).length;
  const reviewBlockedReason = !hasScreenplay
    ? "Write at least one shot"
    : emptyShots > 0
      ? `Describe ${emptyShots === 1 ? "the shot" : `the ${emptyShots} shots`} with an empty action line`
      : undefined;

  const steps = useMemo<SetupStep<StoryboardSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        // An imported script that is kept verbatim is the story, so the brief
        // beside it is optional (F3).
        canAdvance: brief.trim().length > 0 || imported?.preserveWords === true,
        blockedReason: "Write a sentence, or bring your own script",
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
        primaryLabel: upToDate
          ? "Continue to your screenplay"
          : hasScreenplay
            ? "Re-direct your screenplay"
            : "Generate screenplay",
        canAdvance: genre.length > 0,
        blockedReason: "Pick a genre",
        pending: directing,
        pendingLabel: `Writing ${shotCount} shots`,
        // What the run costs, in the same shape every other flow shows before
        // its planning call (F23). A run that is not going to happen — the
        // screenplay already matches these inputs — shows nothing, because it
        // spends nothing.
        generation: upToDate
          ? undefined
          : {
              result: `Write a ${shotCount}-shot screenplay you can edit as text`,
              next: "Review and edit the scenes and shots next. No stills are rendered until the Look step.",
              model: directorModel,
              brief,
              maxOutputTokens: DIRECTOR_MAX_OUTPUT_TOKENS,
              noModelCall: false
            },
        render: () =>
          createElement(GenreStep, {
            boardId,
            shotCount,
            onShotCountChange: setShotCount,
            directing,
            upToDate
          }),
        // The Director runs here, and a refused run must leave the creator on
        // genre with the reason on the button (PRD § 7.2). The hook resolves
        // `false` rather than rejecting — it also drives the board's own
        // Direct button — so the failure is turned into the throw the shell
        // reads.
        onAdvance: upToDate
          ? undefined
          : async () => {
              const directed = await runDirector(shotCount);
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
        primaryLabel: "Choose the look",
        canAdvance: reviewBlockedReason === undefined,
        blockedReason: reviewBlockedReason,
        // `Rewrite from brief` runs outside the shell's primary button, so the
        // shell has to read its wait: nothing may move the creator on while
        // the screenplay they are reading is being replaced (F2).
        pending: directing,
        pendingLabel: `Rewriting ${shotCount} shots`,
        render: () =>
          createElement(ReviewStep, {
            boardId,
            onRewrite: rewrite,
            rewriting: directing,
            error: directError,
            usedFallback,
            onKeepFallback: acceptFallback,
            model: directorModel,
            maxOutputTokens: DIRECTOR_MAX_OUTPUT_TOKENS
          }),
        onAdvance: onReviewed
      },
      {
        stage: "look",
        label: "Look",
        // The price sits beside the button, not inside its name: a label that
        // grows a dollar amount is a label nobody can scan (F23).
        primaryLabel: "Generate your storyboard",
        primaryDetail: look.primaryDetail,
        canAdvance: look.canAdvance,
        blockedReason: look.blockedReason,
        render: () => createElement(LookStep, { boardId }),
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
      acceptFallback,
      boardId,
      brief,
      directError,
      directErrorRef,
      directing,
      directorModel,
      finish,
      genre,
      hasScreenplay,
      imported?.preserveWords,
      look,
      onFinish,
      onReviewed,
      openTutorial,
      reviewBlockedReason,
      rewrite,
      runDirector,
      setShotCount,
      shotCount,
      upToDate,
      usedFallback
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export { DEFAULT_SETUP_SHOT_COUNT };
