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
 */

import React, { memo, useCallback, useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDirectScreenplay } from "../../../hooks/storyboard/useDirectScreenplay";
import { sceneOrder } from "../../../lib/storyboard/sceneOrder";
import { PlanReview } from "../PlanReview";
import type { PlanReviewField, PlanReviewSection } from "../PlanReview";

export interface ReviewStepProps {
  boardId: string;
}

/** One array, so a board that has not loaded yet returns a stable snapshot. */
const NO_SHOTS: readonly Shot[] = [];

const ReviewStepInternal: React.FC<ReviewStepProps> = ({ boardId }) => {
  const shots = useStoryboardStore(
    (state) => state.boards[boardId]?.shots ?? NO_SHOTS
  );
  const scenes = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.scenes
  );
  const title = useStoryboardStore(
    (state) => state.boards[boardId]?.title ?? ""
  );
  const setTitle = useStoryboardStore((state) => state.setTitle);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const updateScene = useStoryboardStore((state) => state.updateScene);
  const { direct, directing, error } = useDirectScreenplay();

  const handleRedirect = useCallback(() => {
    // Re-direct rewrites what is there, so it asks for the shot count the
    // board already has rather than resetting the piece's length.
    void direct(boardId, shots.length);
  }, [boardId, direct, shots.length]);

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
                {
                  id: `${sceneId}:slugline`,
                  label: "Slugline",
                  value: group.scene?.slugline ?? "",
                  placeholder: "INT. LOCATION — TIME",
                  onChange: (value: string) =>
                    updateScene(boardId, sceneId, { slugline: value })
                },
                {
                  id: `${sceneId}:lighting`,
                  label: "Lighting",
                  value: group.scene?.lighting ?? "",
                  placeholder: "How the scene is lit",
                  onChange: (value: string) =>
                    updateScene(boardId, sceneId, { lighting: value })
                }
              ];
        const shotRows = group.shots.flatMap(
          (shot, position): PlanReviewField[] => [
            {
              id: `${shot.id}:action`,
              label: `Shot ${position + 1} · Action`,
              value: shot.action,
              multiline: true,
              onChange: (value: string) =>
                updateShot(boardId, shot.id, { action: value })
            },
            {
              id: `${shot.id}:dialogue`,
              label: `Shot ${position + 1} · Dialogue`,
              value: shot.dialogue ?? "",
              multiline: true,
              placeholder: "No dialogue",
              onChange: (value: string) =>
                updateShot(boardId, shot.id, { dialogue: value })
            }
          ]
        );
        return {
          id: sceneId ?? "unscened",
          header: `Scene ${index + 1}`,
          rows: [...sceneRows, ...shotRows]
        };
      })
    ];
  }, [boardId, scenes, setTitle, shots, title, updateScene, updateShot]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Your screenplay
        </Text>
        <Text size="normal" color="secondary">
          Edit anything here. It is the text your storyboard is drawn from.
        </Text>
      </FlexColumn>
      <PlanReview
        sections={sections}
        replanLabel="Re-direct"
        onReplan={handleRedirect}
        replanPending={directing}
      />
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
