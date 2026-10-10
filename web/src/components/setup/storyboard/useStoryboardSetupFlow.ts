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

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { clampShotCount } from "@nodetool-ai/protocol";
import type {
  StoryboardDocumentSchema,
  StoryboardSetupStage
} from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDirectScreenplay } from "../../../hooks/storyboard/useDirectScreenplay";
import { useImportSource } from "../../../hooks/storyboard/useImportSource";
import {
  cancelBoardDirecting,
  useBoardDirecting
} from "../../../hooks/storyboard/directorRuns";
import { openPageTab } from "../../workspace/openPageTab";
import type { SetupFlowConfig, SetupStep } from "../types";
import { GenreFooterControls, GenreStep } from "./GenreStep";
import { EntitiesStep, type EntityCreation } from "./EntitiesStep";
import { IdeaStep } from "./IdeaStep";
import { LookFooterControls, LookStep, useLookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";
import {
  DEFAULT_SETUP_SHOT_COUNT,
  boardScreenplaySnapshot,
  keepPreviousScreenplay,
  setSetupShotCount,
  useDirectedFrom,
  useSetupShotCount
} from "./setupChoices";
import {
  boardDirectionFingerprint,
  storyboardCreativeContextOf,
  storyboardProductionOf
} from "../../../hooks/storyboard/directionFingerprint";
import {
  productionAuthoringBlocker,
  productionGenerationBlocker,
  productionReviewFingerprint,
  reviewFingerprintOf,
  REVIEW_REQUIRED
} from "../video/productionAuthoring";

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
/**
 * What the camera pass over a script kept as written may answer with. It
 * mirrors `useDirectScreenplay`, which asks for this instead of a screenplay.
 */
const CAMERA_PASS_MAX_OUTPUT_TOKENS = 4096;
const EMPTY_ENTITY_IDS: string[] = [];

const shotsLabel = (count: number): string =>
  `${count} shot${count === 1 ? "" : "s"}`;

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
  const [reviewError, setReviewError] = useState<string>();
  const [contextError, setContextError] = useState<string>();
  const [importingFile, setImportingFile] = useState(false);
  const setSetup = useStoryboardStore((state) => state.setSetup);
  // The values a step writes before its button means anything. Read off the
  // document, so the button follows what the step actually wrote.
  const brief = useStoryboardStore(
    (state) => state.boards[boardId]?.brief ?? ""
  );
  const genre = useStoryboardStore(
    (state) => state.boards[boardId]?.genre ?? ""
  );
  const style = useStoryboardStore(
    (state) => state.boards[boardId]?.style ?? ""
  );
  const aspectRatio = useStoryboardStore(
    (state) => state.boards[boardId]?.aspectRatio ?? "16:9"
  );
  const screenplay = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay
  );
  const storedCreativeContext = useStoryboardStore(
    (state) => state.boards[boardId]?.creativeContext
  );
  const creativeContext =
    storedCreativeContext ?? storyboardCreativeContextOf(screenplay);
  const shots = useStoryboardStore((state) => state.boards[boardId]?.shots);
  const entityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? EMPTY_ENTITY_IDS
  );
  const directorModel = useStoryboardStore(
    (state) => state.boards[boardId]?.directorModel ?? null
  );
  // The reason is read from the ref, not from `error`: the state lands a
  // render after `direct` resolves, and the step's own closure runs first.
  const {
    direct,
    directing: flowDirecting,
    error: directError,
    errorRef: directErrorRef,
    usedFallback,
    acceptFallback
  } = useDirectScreenplay();
  // The agent's `ui_storyboard_direct` writes the same screenplay through its
  // own hook. Its run holds these steps too, so a press here cannot pay for a
  // second screenplay while it writes.
  const boardDirecting = useBoardDirecting(boardId);
  const directing = flowDirecting || boardDirecting;
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

  // Whether a step of this flow wrote `done` and owns the hand-off.
  const handingOverRef = useRef(false);
  // Whether this flow showed a step. An empty store reads `done` before the
  // board loads, and a board loaded as `done` is the host's to finish.
  const sawStepRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  // The agent's `ui_storyboard_set_setup`, or another tab, can write `done`
  // while the flow is up. No step answers for it, so the New tab waited on
  // "Opening your storyboard" forever. The flow hands over itself.
  useEffect(() => {
    if (stage !== "done") {
      sawStepRef.current = true;
      handingOverRef.current = false;
      return;
    }
    if (!sawStepRef.current || handingOverRef.current) {
      return;
    }
    handingOverRef.current = true;
    onFinishRef.current?.();
  }, [stage]);

  const finish = useCallback(() => {
    handingOverRef.current = true;
    setSetup(boardId, { stage: "done" });
    onFinish?.();
  }, [boardId, onFinish, setSetup]);

  const hasScreenplay = (shots?.length ?? 0) > 0;
  // What the run would be asked for now. A screenplay written from exactly
  // these inputs is the screenplay the button would produce, so the step
  // continues to it instead of spending on the same answer twice (F15).
  const fingerprint = useMemo(
    () =>
      boardDirectionFingerprint(
        {
          brief,
          genre,
          style,
          aspectRatio,
          entityIds,
          creativeContext: storedCreativeContext,
          screenplay: screenplay ?? null,
          shots: shots ?? [],
          setupShotCount: shotCount,
          directorModel
        },
        imported?.kind ?? "none"
      ),
    [
      aspectRatio,
      brief,
      directorModel,
      entityIds,
      genre,
      imported?.kind,
      screenplay,
      shotCount,
      shots,
      storedCreativeContext,
      style
    ]
  );
  const upToDate = hasScreenplay && directedFrom === fingerprint;
  // A script kept as written is directed shot for shot: the run adds camera
  // work to the imported shots, so their count is the length and the picker
  // has nothing to change (F13).
  const cameraPass = imported?.preserveWords === true && hasScreenplay;
  const directedShotCount = cameraPass ? (shots?.length ?? 0) : shotCount;
  const reviewKey = productionReviewFingerprint({
    brief,
    genre,
    creativeContext,
    shots
  });
  const hasProductionContext =
    creativeContext !== undefined ||
    storyboardProductionOf(shots ?? []).length > 0;
  const productionBlocker =
    hasProductionContext && reviewFingerprintOf(screenplay) !== reviewKey
      ? REVIEW_REQUIRED
      : productionGenerationBlocker(
          shots ?? [],
          (creativeContext?.reference_bindings?.length ?? 0) > 0,
          "stills"
        );

  /**
   * Run the Director, keeping the screenplay it replaces so the review step
   * can put it back (F15). What the run was answering is recorded by the run
   * itself, so the UI and the headless path cannot disagree about it. The
   * snapshot is taken before the call but kept only when a screenplay lands:
   * a failed or canceled run replaced nothing, and must not drop the undo an
   * earlier rewrite left.
   */
  const runDirector = useCallback(
    async (requestedShots: number, signal?: AbortSignal): Promise<boolean> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const replaced = boardScreenplaySnapshot(board);
      // The Director currently reads context from the screenplay envelope.
      // Mirror the canonical root value through the setup action before planning.
      if (board?.creativeContext) {
        setSetup(boardId, { creative_context: board.creativeContext });
      }
      const directed = await direct(boardId, requestedShots, signal);
      if (directed) {
        keepPreviousScreenplay(boardId, replaced);
      }
      return directed;
    },
    [boardId, direct, setSetup]
  );

  // The review step's own rewrite. It asks for the shot count the board
  // already has rather than resetting the piece's length. It runs outside the
  // shell's button, so the flow keeps its controller and the shell's Cancel
  // aborts it (F16).
  // The run records that count as the board's length, so the genre step's
  // fingerprint answers it and its button continues to the rewrite.
  const rewriteShotCount = clampShotCount(
    hasScreenplay ? (shots?.length ?? shotCount) : shotCount
  );
  const rewriteControllerRef = useRef<AbortController | null>(null);
  // The hook keeps one error for both buttons. A failed run on the genre step
  // is reported there, so the review step only shows the failure of its own
  // rewrite, not a genre-step failure the creator stepped past.
  const [rewriteRan, setRewriteRan] = useState(false);
  // A failed rewrite belongs to that visit to review. Leaving review drops it,
  // so a later visit that ran nothing does not show it again.
  useEffect(() => {
    if (stage !== "review") {
      setRewriteRan(false);
    }
  }, [stage]);
  const rewrite = useCallback(() => {
    setRewriteRan(true);
    rewriteControllerRef.current?.abort();
    const controller = new AbortController();
    rewriteControllerRef.current = controller;
    void runDirector(rewriteShotCount, controller.signal).finally(() => {
      if (rewriteControllerRef.current === controller) {
        rewriteControllerRef.current = null;
      }
    });
  }, [rewriteShotCount, runDirector]);
  const cancelRewrite = useCallback(() => {
    rewriteControllerRef.current?.abort();
    rewriteControllerRef.current = null;
  }, []);
  useEffect(() => cancelRewrite, [cancelRewrite]);
  // Cancel on either story step stops the board's run, whoever started it.
  const cancelDirecting = useCallback(() => {
    cancelRewrite();
    cancelBoardDirecting(boardId);
  }, [boardId, cancelRewrite]);

  // Entities being created from suggestions. Counted here rather than in the
  // step, so a creation that outlives the step still holds the count until it
  // lands, and the shell's Cancel stops every one in flight (F9).
  const [creatingEntities, setCreatingEntities] = useState(0);
  const entityCreationRef = useRef(new AbortController());
  const startEntityCreation = useCallback((): EntityCreation => {
    setCreatingEntities((count) => count + 1);
    let settled = false;
    return {
      signal: entityCreationRef.current.signal,
      done: () => {
        if (!settled) {
          settled = true;
          setCreatingEntities((count) => Math.max(0, count - 1));
        }
      }
    };
  }, []);
  const cancelEntityCreation = useCallback(() => {
    entityCreationRef.current.abort();
    entityCreationRef.current = new AbortController();
  }, []);

  // Every shot the creator is about to pay to render needs something to
  // render. An empty action line reaches the prompt as nothing at all (F20).
  const emptyShots = (shots ?? []).filter(
    (shot) => shot.action.trim().length === 0
  ).length;
  const reviewBlockedReason =
    reviewError ??
    productionAuthoringBlocker(shots ?? []) ??
    (!hasScreenplay
      ? "Write at least one shot"
      : emptyShots > 0
        ? `Describe ${emptyShots === 1 ? "the shot" : `the ${emptyShots} shots`} with an empty action line`
        : undefined);

  const steps = useMemo<SetupStep<StoryboardSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        // An imported script that is kept verbatim is the story, so the brief
        // beside it is optional (F3).
        // A file being read lands on the brief, so Continue waits for it
        // rather than leaving it to land on a step that has moved on (F9).
        canAdvance:
          !importingFile &&
          !contextError &&
          (brief.trim().length > 0 || imported?.preserveWords === true),
        blockedReason: importingFile
          ? "Reading your file"
          : (contextError ?? "Write a sentence, or bring your own script"),
        render: (context) =>
          createElement(IdeaStep, {
            boardId,
            readOnly: context?.readOnly,
            // The blank escape hatch and the last step land in the same
            // place: stage `done` and the board (PRD § 7.1).
            onStartBlank: finish,
            onOpenTutorial: openTutorial,
            onValidationChange: setContextError,
            onImportingChange: setImportingFile
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
        pendingLabel: cameraPass
          ? `Directing ${shotsLabel(directedShotCount)}`
          : `Writing ${shotsLabel(directedShotCount)}`,
        // The shell aborts its own run. A run the agent started has only this.
        onCancel: directing ? cancelDirecting : undefined,
        // What the run costs, in the same shape every other flow shows before
        // its planning call (F23). A run that is not going to happen — the
        // screenplay already matches these inputs — shows nothing, because it
        // spends nothing.
        generation: upToDate
          ? undefined
          : {
              result: cameraPass
                ? `Add camera direction to your ${directedShotCount}-shot script`
                : `Write a ${shotCount}-shot screenplay you can edit as text`,
              next: "Review and edit the scenes and shots next. No stills are rendered until the Look step.",
              model: directorModel,
              brief,
              maxOutputTokens: cameraPass
                ? CAMERA_PASS_MAX_OUTPUT_TOKENS
                : DIRECTOR_MAX_OUTPUT_TOKENS,
              noModelCall: false
            },
        footerControls: (context) =>
          createElement(GenreFooterControls, {
            boardId,
            readOnly: context.readOnly,
            shotCount,
            onShotCountChange: setShotCount,
            hideShotCount: cameraPass
          }),
        render: (context) =>
          createElement(GenreStep, {
            boardId,
            readOnly: context?.readOnly,
            directing,
            upToDate,
            cameraPass
          }),
        // The Director runs here, and a refused run must leave the creator on
        // genre with the reason on the button (PRD § 7.2). The hook resolves
        // `false` rather than rejecting — it also drives the board's own
        // Direct button — so the failure is turned into the throw the shell
        // reads.
        onAdvance: upToDate
          ? undefined
          : async (context) => {
              setRewriteRan(false);
              const directed = await runDirector(shotCount, context?.signal);
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
        primaryLabel: "Set up entities",
        canAdvance: reviewBlockedReason === undefined,
        blockedReason: reviewBlockedReason,
        // `Rewrite from brief` runs outside the shell's primary button, so the
        // shell has to read its wait: nothing may move the creator on while
        // the screenplay they are reading is being replaced (F2).
        pending: directing,
        // The shell's own wait here is `onReviewed`, which writes a linked
        // script it cannot take back. Cancel stops the rewrite only, and the
        // wait is named for what it is.
        // The camera pass directs every imported shot, which can be more
        // than a rewrite may ask for.
        pendingLabel: directing
          ? cameraPass
            ? `Directing ${shotsLabel(directedShotCount)}`
            : `Rewriting ${shotsLabel(rewriteShotCount)}`
          : "Saving your screenplay",
        onCancel: directing ? cancelDirecting : undefined,
        cancelable: false,
        render: (context) =>
          createElement(ReviewStep, {
            boardId,
            readOnly: context?.readOnly,
            onRewrite: rewrite,
            rewriting: directing,
            error: rewriteRan ? directError : null,
            usedFallback,
            onKeepFallback: acceptFallback,
            model: directorModel,
            // A script kept as written is re-run as the camera pass, which
            // answers with less than a whole screenplay.
            maxOutputTokens: cameraPass
              ? CAMERA_PASS_MAX_OUTPUT_TOKENS
              : DIRECTOR_MAX_OUTPUT_TOKENS,
            onValidationChange: setReviewError
          }),
        onAdvance: async () => {
          await onReviewed?.();
          setSetup(boardId, { production_review_fingerprint: reviewKey });
        }
      },
      {
        stage: "entities",
        label: "Entities",
        primaryLabel: "Choose the look",
        canAdvance: entityIds.length > 0,
        blockedReason: "Select or create an entity, or skip this step",
        skipLabel: "Skip entities",
        onSkip: () => undefined,
        pending: creatingEntities > 0,
        pendingLabel:
          creatingEntities === 1
            ? "Creating an entity"
            : `Creating ${creatingEntities} entities`,
        onCancel: cancelEntityCreation,
        render: (context) =>
          createElement(EntitiesStep, {
            boardId,
            readOnly: context?.readOnly,
            onCreationStart: startEntityCreation
          })
      },
      {
        stage: "look",
        label: "Look",
        // The price sits beside the button, not inside its name: a label that
        // grows a dollar amount is a label nobody can scan (F23).
        primaryLabel: "Generate your storyboard",
        primaryDetail: look.primaryDetail,
        footerControls: (context) =>
          createElement(LookFooterControls, {
            boardId,
            readOnly: context.readOnly
          }),
        canAdvance: !productionBlocker && look.canAdvance,
        blockedReason: productionBlocker ?? look.blockedReason,
        render: (context) =>
          createElement(LookStep, {
            boardId,
            readOnly: context?.readOnly,
            blockedReason: productionBlocker ?? look.blockedReason
          }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (PRD § 7.3, D3); the host opens the board once the jobs are
        // away.
        onAdvance: async () => {
          if (productionBlocker) {
            throw new Error(productionBlocker);
          }
          // `generate` writes `done` before the stills are away. The hand-off
          // is this step's, once they are.
          handingOverRef.current = true;
          await look.generate();
          onFinish?.();
        }
      }
    ],
    [
      acceptFallback,
      boardId,
      cameraPass,
      cancelDirecting,
      cancelEntityCreation,
      contextError,
      creatingEntities,
      brief,
      directError,
      directErrorRef,
      directedShotCount,
      directing,
      directorModel,
      entityIds.length,
      finish,
      genre,
      hasScreenplay,
      imported?.preserveWords,
      importingFile,
      look,
      onFinish,
      onReviewed,
      openTutorial,
      productionBlocker,
      reviewKey,
      rewriteRan,
      setSetup,
      reviewBlockedReason,
      rewrite,
      rewriteShotCount,
      runDirector,
      setShotCount,
      shotCount,
      startEntityCreation,
      upToDate,
      usedFallback
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export { DEFAULT_SETUP_SHOT_COUNT };
