/**
 * Step 2 of the storyboard flow, second half — the screenplay review
 * (PRD § 7.2).
 *
 * The directed screenplay as editable text: one section per scene, its
 * slugline and lighting note, then each shot's action and dialogue. Every edit
 * writes through `updateShot` / `updateScene`, because the document is the
 * draft — there is no separate review copy to reconcile, and the shot edited
 * here is the shot step 3 renders (criterion 4).
 *
 * Cheap text before spend (D4): nothing on this step starts a render. The one
 * model call it can make is `Re-direct`, which rewrites the same text through
 * `setScreenplay` — a merge by shot id, so a shot the revision keeps keeps its
 * id, its stills and its clips.
 *
 * An imported script adds a notice above the text (D10): an FDX says which
 * shots the post-check put back, a PDF or DOCX which source lines no shot
 * picked up. The lines are named, never silently dropped, because the words
 * are the creator's.
 */

import React, {
  Suspense,
  lazy,
  memo,
  useCallback,
  useMemo,
  useEffect,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text
} from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useImportNotice } from "../../../hooks/storyboard/useImportNotice";
import { useImportSource } from "../../../hooks/storyboard/useImportSource";
import { sceneOrder } from "../../../lib/storyboard/sceneOrder";
import { PlanReview } from "../PlanReview";
import ErrorBanner from "../../support/ErrorBanner";
import { REVIEW_WIDE_WIDTH } from "../reviewStyles";
import {
  productionFields,
  productionPatch,
  productionAuthoringBlocker,
  productionGenerationBlocker
} from "../video/productionAuthoring";
import { productionRequirementsFrom } from "../../../hooks/storyboard/productionContext";
import type { GenerationModel } from "../generationEstimate";
import {
  forgetPreviousScreenplay,
  usePreviousScreenplay
} from "./setupChoices";
import type {
  PlanReviewField,
  PlanReviewGroup,
  PlanReviewSection
} from "../PlanReview";

// The estimate pulls in the provider price tables, which nothing on this step
// needs until it is on screen — the shell lazy-loads it the same way.
const GenerationSummary = lazy(() => import("../GenerationSummary"));

export interface ReviewStepProps {
  boardId: string;
  /**
   * Re-runs the Director on the current brief. The flow owns the call, so the
   * shell can hold the primary button while it is in flight (F2).
   */
  onRewrite: () => void;
  rewriting: boolean;
  /** The last run's refusal, in the provider's own words. */
  error: string | null;
  /** The screenplay on the board is the local placeholder outline (F9). */
  usedFallback?: boolean;
  /** The creator kept the placeholder outline. */
  onKeepFallback?: () => void;
  /** The model a rewrite would call, for the estimate beside it (F23). */
  model: GenerationModel | null;
  maxOutputTokens: number;
  onValidationChange?: (reason: string | undefined) => void;
  /** View mode: the screenplay reads as text and nothing on it changes. */
  readOnly?: boolean;
}

/** One array, so a board that has not loaded yet returns a stable snapshot. */
const NO_SHOTS: readonly Shot[] = [];

/** How many shots the import notice names before it counts the rest. */
const NAMED_SHOT_LIMIT = 8;

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  boardId,
  onRewrite,
  rewriting,
  error,
  usedFallback = false,
  onKeepFallback,
  model,
  maxOutputTokens,
  onValidationChange,
  readOnly = false
}) => {
  const { t } = useTranslation();
  const shots = useStoryboardStore(
    (state) => state.boards[boardId]?.shots ?? NO_SHOTS
  );
  const scenes = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.scenes
  );
  const title = useStoryboardStore(
    (state) => state.boards[boardId]?.title ?? ""
  );
  const brief = useStoryboardStore(
    (state) => state.boards[boardId]?.brief ?? ""
  );
  const setTitle = useStoryboardStore((state) => state.setTitle);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const updateScene = useStoryboardStore((state) => state.updateScene);
  const setScreenplay = useStoryboardStore((state) => state.setScreenplay);
  const notice = useImportNotice(boardId);
  // Typed durations, each with the length the shot had when it was typed. A
  // rewrite or a restore that gives the shot another length outdates the
  // draft, so the field shows the length the shot now has.
  const [drafts, setDrafts] = useState<
    Record<string, { value: string; base: number | undefined }>
  >({});
  const lengths = useMemo(() => {
    const live: Record<string, string> = {};
    for (const shot of shots) {
      const draft = drafts[shot.id];
      if (draft && draft.base === shot.duration_seconds) {
        live[shot.id] = draft.value;
      }
    }
    return live;
  }, [drafts, shots]);
  const invalidDuration = shots.some((shot) => {
    const value = lengths[shot.id];
    return (
      value !== undefined &&
      value.trim() !== "" &&
      (!Number.isFinite(Number(value)) || Math.round(Number(value) * 1000) <= 0)
    );
  });
  const translateProductionMessage = useCallback(
    (message: string | undefined) => {
      switch (message) {
        case "Complete production requirements: speech needs a binding and takes must be 1–3.":
          return t("pass3_11.storyboard.review.production.invalidRequirements");
        case "Add the local speech line, or choose Speech mode None. The last saved binding is retained.":
          return t("pass3_11.storyboard.review.production.missingSpeechLine");
        case "Complete the production requirements: speech needs a line or audio binding, and takes must be 1–3.":
          return t(
            "pass3_11.storyboard.review.production.invalidGenerationRequirements"
          );
        case "On-camera speech is unavailable in this guided flow. Choose Off-camera or None.":
          return t("pass3_11.storyboard.review.production.onCameraUnavailable");
        default:
          return message;
      }
    },
    [t]
  );
  const validationReason = invalidDuration
    ? t("pass3_11.storyboard.review.validation.positiveDuration")
    : translateProductionMessage(productionAuthoringBlocker(shots));
  useEffect(() => {
    onValidationChange?.(validationReason);
    return () => onValidationChange?.(undefined);
  }, [onValidationChange, validationReason]);
  const productionNote = translateProductionMessage(
    productionGenerationBlocker(shots, false)
  );
  // What a rewrite replaced, kept for as long as the tab is open, so the
  // creator can put it back rather than reconstructing it by hand (F15).
  const replaced = usePreviousScreenplay(boardId);
  // A script kept as written is never rewritten from the brief: the run only
  // adds camera work to the imported words, so the banner says that (F14).
  const keptAsWritten = useImportSource(boardId)?.preserveWords === true;

  // What the post-check touched, in the numbering the creator is reading.
  // One pass over the scene groups: an answer that reordered a long script
  // corrects every shot, and re-deriving each one's number would walk the
  // board once per shot.
  const shotNumbers = useMemo(() => {
    const numbers = new Map<string, string>();
    sceneOrder(shots).forEach((group, sceneIndex) => {
      group.shots.forEach((shot, position) => {
        numbers.set(
          shot.id,
          t("pass3_11.storyboard.review.shotNumber", {
            scene: sceneIndex + 1,
            shot: position + 1
          })
        );
      });
    });
    return numbers;
  }, [shots, t]);

  const importNotice = useMemo(() => {
    if (!notice) {
      return null;
    }
    if (notice.kind === "fdx") {
      if (notice.correctedShotIds.length === 0) {
        return null;
      }
      const named = notice.correctedShotIds
        .map((id) => shotNumbers.get(id))
        .filter((number): number is string => number !== undefined);
      const listed = named.slice(0, NAMED_SHOT_LIMIT).join(", ");
      const rest = named.length - NAMED_SHOT_LIMIT;
      return {
        severity: "warning" as const,
        title: t("pass3_11.storyboard.review.import.keptAsWrittenTitle"),
        body:
          rest > 0
            ? t("pass3_11.storyboard.review.import.correctedShotsWithMore", {
                listed,
                count: rest
              })
            : t("pass3_11.storyboard.review.import.correctedShots", {
                listed
              })
      };
    }
    if (notice.missingLines.length === 0) {
      return null;
    }
    return {
      severity: "info" as const,
      title: t("pass3_11.storyboard.review.import.missingLinesTitle"),
      body: notice.missingLines.join(" · ")
    };
  }, [notice, shotNumbers, t]);

  // What the creator is looking at, in one line: a screenplay is long, and
  // the scroll gives no sense of its size while reading it.
  const summary = useMemo(() => {
    const sceneCount = sceneOrder(shots, scenes).length;
    const seconds = shots.reduce(
      (total, shot) => total + (shot.duration_seconds ?? 0),
      0
    );
    const parts = [
      t("pass3_11.storyboard.review.summary.shots", { count: shots.length }),
      t("pass3_11.storyboard.review.summary.scenes", { count: sceneCount })
    ];
    if (seconds > 0) {
      parts.push(
        t("pass3_11.storyboard.review.summary.duration", {
          seconds: Math.round(seconds)
        })
      );
    }
    return parts.join(" · ");
  }, [scenes, shots, t]);

  const handleRestore = useCallback(() => {
    if (replaced && !readOnly) {
      // The undo is for the story: its shots, scenes and title. Everything
      // picked since, on this step or a later one the creator came back from
      // (entities, style, aspect ratio, the brief), stays as it is now (F14).
      const current = useStoryboardStore.getState().getBoard(boardId);
      const currentShots = new Map(
        (current?.shots ?? []).map((shot) => [shot.id, shot])
      );
      // `setScreenplay` merges by shot id, so a shot both versions hold keeps
      // its stills and its clips.
      setScreenplay(boardId, {
        ...replaced,
        shots: replaced.shots.map((shot) => ({
          ...shot,
          entity_ids: currentShots.get(shot.id)?.entity_ids
        })),
        brief: current?.brief ?? replaced.brief,
        style_bible: current?.style ?? replaced.style_bible,
        aspect_ratio: current?.aspectRatio ?? replaced.aspect_ratio,
        entity_ids: current ? [...current.entityIds] : replaced.entity_ids
      });
      forgetPreviousScreenplay(boardId);
    }
  }, [boardId, readOnly, replaced, setScreenplay]);

  const productionFieldLabel = useCallback(
    (label: string): string => {
      switch (label) {
        case "Editorial purpose":
          return t("pass3_11.storyboard.review.production.editorialPurpose");
        case "Visual treatment":
          return t("pass3_11.storyboard.review.production.visualTreatment");
        case "Requested takes":
          return t("pass3_11.storyboard.review.production.requestedTakes");
        case "Speech mode":
          return t("pass3_11.storyboard.review.production.speechMode");
        case "Script line":
          return t("pass3_11.storyboard.review.production.scriptLine");
        case "Production direction":
          return t("pass3_11.storyboard.review.production.direction");
        default:
          return label;
      }
    },
    [t]
  );

  const productionOptionLabel = useCallback(
    (value: string, label: string): string => {
      switch (value) {
        case "hook":
          return t("pass3_11.storyboard.review.production.purpose.hook");
        case "problem":
          return t("pass3_11.storyboard.review.production.purpose.problem");
        case "demonstration":
          return t(
            "pass3_11.storyboard.review.production.purpose.demonstration"
          );
        case "proof":
          return t("pass3_11.storyboard.review.production.purpose.proof");
        case "cta":
          return t(
            "pass3_11.storyboard.review.production.purpose.callToAction"
          );
        case "story":
          return t("pass3_11.storyboard.review.production.purpose.story");
        case "actor_to_camera":
          return t(
            "pass3_11.storyboard.review.production.treatment.actorToCamera"
          );
        case "product_close_up":
          return t(
            "pass3_11.storyboard.review.production.treatment.productCloseUp"
          );
        case "lifestyle_b_roll":
          return t(
            "pass3_11.storyboard.review.production.treatment.lifestyleBroll"
          );
        case "generated_scene":
          return t(
            "pass3_11.storyboard.review.production.treatment.generatedScene"
          );
        case "none":
          return t("pass3_11.storyboard.review.production.speech.none");
        case "off_camera":
          return t("pass3_11.storyboard.review.production.speech.offCamera");
        case "on_camera":
          return t(
            "pass3_11.storyboard.review.production.speech.onCameraUnavailable"
          );
        default:
          return label;
      }
    },
    [t]
  );

  const productionFieldHint = useCallback(
    (hint: string | undefined): string | undefined => {
      switch (hint) {
        case "Add a line before choosing a speech mode.":
          return t("pass3_11.storyboard.review.production.hints.addLine");
        case "Bound to a Script line. Edit the words and the voice in Script.":
          return t("pass3_11.storyboard.review.production.hints.boundToScript");
        case "Bound to a recorded audio take.":
          return t("pass3_11.storyboard.review.production.hints.boundToAudio");
        case "Uses local speech. Production voice and audio resolution are unavailable in this setup.":
          return t("pass3_11.storyboard.review.production.hints.localSpeech");
        default:
          return hint;
      }
    },
    [t]
  );

  const sections = useMemo((): PlanReviewSection[] => {
    const groups = sceneOrder(shots, scenes);
    const screenplaySection: PlanReviewSection = {
      id: "screenplay",
      header: t("pass3_11.storyboard.review.fields.title"),
      rows: [
        {
          id: "title",
          label: t("pass3_11.storyboard.review.fields.title"),
          hideLabel: true,
          value: title,
          onChange: (value: string) => setTitle(boardId, value)
        }
      ]
    };
    const all = [
      screenplaySection,
      ...groups.map((group, index): PlanReviewSection => {
        const sceneId = group.sceneId;
        const sceneRows: PlanReviewField[] =
          sceneId === null
            ? []
            : [
                // The scene's own two lines sit between its header and its
                // first shot, so they carry no labels of their own: the
                // placeholders say what each one is, and four labelled blocks
                // per scene buried the shots.
                //
                // Both wrap rather than scroll: the rail is narrower than a
                // slugline, and a scene whose name reads `INT. BLACK PRODUCT
                // STUDIO — I` says nothing about where it is set.
                {
                  id: `${sceneId}:slugline`,
                  label: t("pass3_11.storyboard.review.fields.slugline"),
                  hideLabel: true,
                  multiline: true,
                  value: group.scene?.slugline ?? "",
                  placeholder: t(
                    "pass3_11.storyboard.review.fields.sluglinePlaceholder"
                  ),
                  onChange: (value: string) =>
                    updateScene(boardId, sceneId, { slugline: value })
                },
                {
                  id: `${sceneId}:lighting`,
                  label: t("pass3_11.storyboard.review.fields.lighting"),
                  hideLabel: true,
                  multiline: true,
                  value: group.scene?.lighting ?? "",
                  placeholder: t(
                    "pass3_11.storyboard.review.fields.lightingPlaceholder"
                  ),
                  onChange: (value: string) =>
                    updateScene(boardId, sceneId, { lighting: value })
                }
              ];
        // One block per shot, rather than one run of `Shot N · …` rows: a
        // scene is read shot by shot, and a flat column of labelled fields
        // gave the eye nothing to break on.
        const shotGroups = group.shots.map(
          (shot, position): PlanReviewGroup => ({
            id: shot.id,
            header: t("pass3_11.storyboard.review.fields.shotHeader", {
              count: position + 1
            }),
            // What the shot is, beside its number: its slug and how long it
            // runs. Both are optional on the document, so a shot with neither
            // shows a bare heading.
            meta:
              shot.slug && shot.slug !== group.scene?.slugline
                ? shot.slug
                : undefined,
            rows: [
              {
                id: `${shot.id}:action`,
                label: t("pass3_11.storyboard.review.fields.shotAction", {
                  count: position + 1
                }),
                // The block's heading numbers the shot, so the row does not
                // repeat it; the label stays as the field's accessible name.
                hideLabel: true,
                value: shot.action,
                multiline: true,
                onChange: (value: string) =>
                  updateShot(boardId, shot.id, { action: value })
              },
              {
                id: `${shot.id}:dialogue`,
                label: t("pass3_11.storyboard.review.fields.shotDialogue", {
                  count: position + 1
                }),
                readOnly:
                  !!shot.script_line_ids?.length ||
                  !!productionRequirementsFrom(shot)?.speech_binding
                    ?.script_line_id ||
                  !!productionRequirementsFrom(shot)?.speech_binding
                    ?.audio_asset_id,
                // Existing dialogue stays readable. Empty dialogue opens on request.
                hideLabel: true,
                // Dialogue sets in from action, as it does on the page.
                indent: true,
                value:
                  shot.dialogue ??
                  productionRequirementsFrom(shot)?.speech_binding?.text ??
                  "",
                multiline: true,
                placeholder: t(
                  "pass3_11.storyboard.review.fields.dialoguePlaceholder"
                ),
                addLabel: t("pass3_11.storyboard.review.fields.addDialogue"),
                onChange: (value: string) => {
                  const current = productionRequirementsFrom(shot);
                  const production =
                    current?.speech_binding?.text && value.trim()
                      ? productionPatch(current, {
                          speech_binding: {
                            ...current.speech_binding,
                            text: value
                          }
                        })
                      : current;
                  const patch: Partial<Shot> = { dialogue: value };
                  if (production) {
                    patch.production = production;
                  }
                  updateShot(boardId, shot.id, patch);
                }
              },
              {
                // How long the shot runs is a value the creator sets here, not
                // a number the review only reports: the claim above this list
                // is that everything on the page is editable (F20). Typing one
                // pins it, the way the shot dialog's ERT field does.
                id: `${shot.id}:duration`,
                // Named like the production fields beside it, which repeat per
                // shot too: the block's heading says which shot they are on,
                // and `Shot 1 · Seconds` wrapped to two lines in the narrow
                // column while its neighbours took one.
                label: t("pass3_11.storyboard.review.fields.seconds"),
                compact: true,
                value:
                  lengths[shot.id] ??
                  (shot.duration_seconds ? String(shot.duration_seconds) : ""),
                onChange: (value: string) => {
                  setDrafts((current) => ({
                    ...current,
                    [shot.id]: { value, base: shot.duration_seconds }
                  }));
                },
                onCommit: (value: string) => {
                  const seconds = Number(value);
                  if (
                    value.trim() &&
                    (!Number.isFinite(seconds) ||
                      Math.round(seconds * 1000) <= 0)
                  ) {
                    return;
                  }
                  const current = productionRequirementsFrom(shot);
                  const patch: Partial<Shot> = {
                    duration_seconds:
                      value.trim() === "" ||
                      !Number.isFinite(seconds) ||
                      seconds <= 0
                        ? undefined
                        : seconds,
                    duration_source: "manual"
                  };
                  if (current) {
                    patch.production = productionPatch(current, {
                      duration_ms:
                        Number.isFinite(seconds) && seconds > 0
                          ? Math.round(seconds * 1000)
                          : undefined
                    });
                  }
                  updateShot(boardId, shot.id, patch);
                }
              },
              ...productionFields({
                id: shot.id,
                value: shot,
                speechText:
                  shot.dialogue ??
                  productionRequirementsFrom(shot)?.speech_binding?.text ??
                  "",
                linkedLineIds: shot.script_line_ids,
                onChange: (production) => {
                  const patch = { production, action: shot.action };
                  updateShot(boardId, shot.id, patch);
                }
              }).map((field) => ({
                ...field,
                label: productionFieldLabel(field.label),
                placeholder:
                  field.placeholder ===
                  "Optional performance or camera direction"
                    ? t(
                        "pass3_11.storyboard.review.production.directionPlaceholder"
                      )
                    : field.placeholder,
                hint: productionFieldHint(field.hint),
                options: field.options?.map((option) => ({
                  ...option,
                  label:
                    option.value === ""
                      ? t("pass3_11.storyboard.review.production.unspecified")
                      : productionOptionLabel(String(option.value), String(option.label))
                }))
              }))
            ]
          })
        );
        return {
          id: sceneId ?? "unscened",
          header: t("pass3_11.storyboard.review.fields.sceneHeader", {
            count: index + 1
          }),
          // The slugline is the scene's name, but it is also the first field
          // below — the header says how big the scene is instead, which the
          // rows do not.
          subheader: t("pass3_11.storyboard.review.summary.shots", {
            count: group.shots.length
          }),
          rows: sceneRows,
          groups: shotGroups
        };
      })
    ];
    if (!readOnly) {
      return all;
    }
    // View mode holds every field, and leaves "More options" and the rest of
    // the reading controls usable.
    const hold = (rows: readonly PlanReviewField[]): PlanReviewField[] =>
      rows.map((row) => ({ ...row, readOnly: true }));
    return all.map((section) => ({
      ...section,
      rows: hold(section.rows),
      groups: section.groups?.map((group) => ({
        ...group,
        rows: hold(group.rows)
      }))
    }));
  }, [
    boardId,
    lengths,
    productionFieldHint,
    productionFieldLabel,
    productionOptionLabel,
    readOnly,
    scenes,
    setTitle,
    shots,
    t,
    title,
    updateScene,
    updateShot
  ]);

  return (
    <FlexColumn
      gap={GAP.comfortable}
      sx={{ width: "100%", maxWidth: REVIEW_WIDE_WIDTH }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_11.storyboard.review.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_11.storyboard.review.description")}
        </Text>
      </FlexColumn>
      {importNotice ? (
        <AlertBanner
          severity={importNotice.severity}
          title={importNotice.title}
        >
          <Caption component="span">{importNotice.body}</Caption>
        </AlertBanner>
      ) : null}
      {/* A placeholder outline is not the Director's work, and editing one
          believing it is wastes the edit. It is named, and the creator decides
          whether to keep it (F9). */}
      {usedFallback ? (
        <AlertBanner
          severity="warning"
          title={t("pass3_11.storyboard.review.fallback.title")}
        >
          <FlexColumn gap={GAP.tight}>
            <Caption component="span">
              {t("pass3_11.storyboard.review.fallback.description")}
            </Caption>
            <FlexRow gap={GAP.normal} wrap>
              <EditorButton
                variant="outlined"
                size="small"
                disabled={readOnly || rewriting}
                onClick={onRewrite}
              >
                {t("pass3_11.storyboard.review.fallback.runDirector")}
              </EditorButton>
              {onKeepFallback ? (
                <EditorButton
                  variant="text"
                  size="small"
                  onClick={onKeepFallback}
                  disabled={readOnly}
                >
                  {t("pass3_11.storyboard.review.fallback.keepOutline")}
                </EditorButton>
              ) : null}
            </FlexRow>
          </FlexColumn>
        </AlertBanner>
      ) : null}
      {/* The rewrite replaced a screenplay the creator may have already
          edited. Putting it back is one press for as long as the tab is
          open (F15). */}
      {replaced ? (
        <AlertBanner
          severity="info"
          title={
            keptAsWritten
              ? t("pass3_11.storyboard.review.previous.directedFromScript")
              : t("pass3_11.storyboard.review.previous.rewrittenFromBrief")
          }
        >
          <FlexRow gap={GAP.normal} align="center" wrap>
            <Caption component="span">
              {keptAsWritten
                ? t("pass3_11.storyboard.review.previous.beforeCameraPass")
                : t("pass3_11.storyboard.review.previous.previousScreenplay")}
            </Caption>
            <EditorButton
              variant="outlined"
              size="small"
              disabled={readOnly || rewriting}
              onClick={handleRestore}
            >
              {t("pass3_11.storyboard.review.previous.restore")}
            </EditorButton>
          </FlexRow>
        </AlertBanner>
      ) : null}
      {/* Keep the rewrite action and its spend details together at the same
          reading width as the screenplay. */}
      <FlexColumn gap={GAP.normal} sx={{ maxWidth: REVIEW_WIDE_WIDTH }}>
        <FlexRow gap={GAP.normal} align="center" justify="space-between" wrap>
          <Caption component="p" color="muted">
            {summary}
          </Caption>
          <EditorButton
            variant="outlined"
            size="small"
            disabled={readOnly || rewriting}
            onClick={onRewrite}
          >
            {keptAsWritten
              ? rewriting
                ? t("pass3_11.storyboard.review.actions.directingScript")
                : t("pass3_11.storyboard.review.actions.directAgain")
              : rewriting
                ? t("pass3_11.storyboard.review.actions.rewriting")
                : t("pass3_11.storyboard.review.actions.rewriteFromBrief")}
          </EditorButton>
        </FlexRow>
        {/* A failed rewrite is read where it was pressed, not below a
            screenplay that can run to dozens of shots. */}
        {error ? (
          <ErrorBanner
            report={{
              source: "provider-call",
              summary: t("pass3_11.storyboard.review.error.reportSummary"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        ) : null}
        <Suspense
          fallback={
            <Caption color="secondary">
              {t("pass3_11.storyboard.review.loadingEstimate")}
            </Caption>
          }
        >
          <GenerationSummary
            result={
              keptAsWritten
                ? t("pass3_11.storyboard.review.estimate.directScript")
                : t("pass3_11.storyboard.review.estimate.rewriteBrief")
            }
            next={
              keptAsWritten
                ? t("pass3_11.storyboard.review.estimate.scriptNext")
                : t("pass3_11.storyboard.review.estimate.briefNext")
            }
            model={model}
            brief={brief}
            maxOutputTokens={maxOutputTokens}
            compact
          />
        </Suspense>
      </FlexColumn>
      {validationReason ? (
        <Caption role="alert" color="warning">
          {validationReason}
        </Caption>
      ) : null}
      {productionNote ? (
        <Caption role="status" color="warning">
          {productionNote}
        </Caption>
      ) : null}
      <PlanReview sections={sections} />
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ReviewStep";

export default ReviewStep;
