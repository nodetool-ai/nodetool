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

import React, { Suspense, lazy, memo, useCallback, useMemo } from "react";
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
import { sceneOrder } from "../../../lib/storyboard/sceneOrder";
import { PlanReview } from "../PlanReview";
import { REVIEW_WIDE_WIDTH } from "../reviewStyles";
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
  maxOutputTokens
}) => {
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
  // What a rewrite replaced, kept for as long as the tab is open, so the
  // creator can put it back rather than reconstructing it by hand (F15).
  const replaced = usePreviousScreenplay(boardId);

  // What the post-check touched, in the numbering the creator is reading.
  // One pass over the scene groups: an answer that reordered a long script
  // corrects every shot, and re-deriving each one's number would walk the
  // board once per shot.
  const shotNumbers = useMemo(() => {
    const numbers = new Map<string, string>();
    sceneOrder(shots).forEach((group, sceneIndex) => {
      group.shots.forEach((shot, position) => {
        numbers.set(shot.id, `Scene ${sceneIndex + 1} | Shot ${position + 1}`);
      });
    });
    return numbers;
  }, [shots]);

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
        title: "Your script was kept as written",
        body: `The Director changed the words or the order of ${listed}${
          rest > 0 ? ` and ${rest} more` : ""
        }. The imported text was put back.`
      };
    }
    if (notice.missingLines.length === 0) {
      return null;
    }
    return {
      severity: "info" as const,
      title: "Some lines are not in any shot",
      body: notice.missingLines.join(" · ")
    };
  }, [notice, shotNumbers]);

  // What the creator is looking at, in one line: a screenplay is long, and
  // the scroll gives no sense of its size while reading it.
  const summary = useMemo(() => {
    const sceneCount = sceneOrder(shots, scenes).length;
    const seconds = shots.reduce(
      (total, shot) => total + (shot.duration_seconds ?? 0),
      0
    );
    const parts = [
      `${shots.length} shot${shots.length === 1 ? "" : "s"}`,
      `${sceneCount} scene${sceneCount === 1 ? "" : "s"}`
    ];
    if (seconds > 0) {
      parts.push(`about ${Math.round(seconds)}s`);
    }
    return parts.join(" · ");
  }, [scenes, shots]);

  const handleRestore = useCallback(() => {
    if (replaced) {
      // `setScreenplay` merges by shot id, so a shot both versions hold keeps
      // its stills and its clips.
      setScreenplay(boardId, replaced);
      forgetPreviousScreenplay(boardId);
    }
  }, [boardId, replaced, setScreenplay]);

  const sections = useMemo((): PlanReviewSection[] => {
    const groups = sceneOrder(shots, scenes);
    const screenplaySection: PlanReviewSection = {
      id: "screenplay",
      header: "Screenplay",
      rows: [
        {
          id: "title",
          label: "Title",
          value: title,
          onChange: (value: string) => setTitle(boardId, value)
        }
      ]
    };
    return [
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
                {
                  id: `${sceneId}:slugline`,
                  label: "Slugline",
                  hideLabel: true,
                  value: group.scene?.slugline ?? "",
                  placeholder: "INT. LOCATION — TIME",
                  onChange: (value: string) =>
                    updateScene(boardId, sceneId, { slugline: value })
                },
                {
                  id: `${sceneId}:lighting`,
                  label: "Lighting",
                  hideLabel: true,
                  value: group.scene?.lighting ?? "",
                  placeholder: "How the scene is lit",
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
            header: `Shot ${position + 1}`,
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
                label: `Shot ${position + 1} · Action`,
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
                label: `Shot ${position + 1} · Dialogue`,
                // Existing dialogue stays readable. Empty dialogue opens on request.
                hideLabel: true,
                // Dialogue sets in from action, as it does on the page.
                indent: true,
                value: shot.dialogue ?? "",
                multiline: true,
                placeholder: "Dialogue",
                addLabel: "Add dialogue",
                onChange: (value: string) =>
                  updateShot(boardId, shot.id, { dialogue: value })
              },
              {
                // How long the shot runs is a value the creator sets here, not
                // a number the review only reports: the claim above this list
                // is that everything on the page is editable (F20). Typing one
                // pins it, the way the shot dialog's ERT field does.
                id: `${shot.id}:duration`,
                label: `Shot ${position + 1} · Seconds`,
                compact: true,
                value: shot.duration_seconds
                  ? String(Math.round(shot.duration_seconds))
                  : "",
                placeholder: "Seconds",
                onChange: (value: string) => {
                  const seconds = Number(value);
                  updateShot(boardId, shot.id, {
                    duration_seconds:
                      value.trim() === "" || !Number.isFinite(seconds) || seconds <= 0
                        ? undefined
                        : seconds,
                    duration_source: "manual"
                  });
                }
              }
            ]
          })
        );
        return {
          id: sceneId ?? "unscened",
          header: `Scene ${index + 1}`,
          // The slugline is the scene's name, but it is also the first field
          // below — the header says how big the scene is instead, which the
          // rows do not.
          subheader: `${group.shots.length} shot${
            group.shots.length === 1 ? "" : "s"
          }`,
          rows: sceneRows,
          groups: shotGroups
        };
      })
    ];
  }, [boardId, scenes, setTitle, shots, title, updateScene, updateShot]);

  return (
    <FlexColumn
      gap={GAP.comfortable}
      sx={{ width: "100%", maxWidth: REVIEW_WIDE_WIDTH }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Your screenplay
        </Text>
        <Text size="normal" color="secondary">
          Edit anything here. It is the text your storyboard is drawn from.
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
        <AlertBanner severity="warning" title="Written here, not by your model">
          <FlexColumn gap={GAP.tight}>
            <Caption component="span">
              Your model returned nothing usable, so this outline was built
              from your brief. Keep it and edit it, or run the Director again.
            </Caption>
            <FlexRow gap={GAP.normal} wrap>
              <EditorButton
                variant="outlined"
                size="small"
                disabled={rewriting}
                onClick={onRewrite}
              >
                Run the Director again
              </EditorButton>
              {onKeepFallback ? (
                <EditorButton
                  variant="text"
                  size="small"
                  onClick={onKeepFallback}
                >
                  Keep this outline
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
        <AlertBanner severity="info" title="Rewritten from your brief">
          <FlexRow gap={GAP.normal} align="center" wrap>
            <Caption component="span">
              The previous screenplay is still here.
            </Caption>
            <EditorButton
              variant="outlined"
              size="small"
              disabled={rewriting}
              onClick={handleRestore}
            >
              Restore the previous screenplay
            </EditorButton>
          </FlexRow>
        </AlertBanner>
      ) : null}
      {/* The retry sits with the heading, not below every shot: it is what a
          creator reaches for after reading the first two shots, and at the
          bottom of a twelve-field page it was never found. */}
      <FlexRow gap={GAP.normal} align="center" justify="space-between" wrap>
        <Caption component="p" color="muted">
          {summary}
        </Caption>
        <EditorButton
          variant="outlined"
          size="small"
          disabled={rewriting}
          onClick={onRewrite}
        >
          {rewriting ? "Rewriting screenplay…" : "Rewrite from brief"}
        </EditorButton>
      </FlexRow>
      {/* A rewrite is another model call, so it carries the same summary the
          first one did rather than spending on a quieter button (F23). */}
      <Suspense fallback={<Caption color="secondary">Loading estimate…</Caption>}>
        <GenerationSummary
          result="Rewrite the screenplay from your brief"
          next="Shots this rewrite keeps keep their ids and any stills. No stills are rendered here."
          model={model}
          brief={brief}
          maxOutputTokens={maxOutputTokens}
        />
      </Suspense>
      <PlanReview sections={sections} />
      {error ? (
        <Text size="small" color="error" role="alert">
          {error}
        </Text>
      ) : null}
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ReviewStep";

export default ReviewStep;
