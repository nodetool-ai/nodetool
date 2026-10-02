import type { CreativeContext, Entity } from "@nodetool-ai/protocol";
import {
  materializeStoryboard,
  type FinishStoryboardInput,
  type FinishedStoryboardDocument,
  type ProducedTimelineIssue
} from "./finish-storyboard.js";
import { validateStoryboardSemantics } from "./storyboardValidation.js";
import { stableSerialize } from "./stableSerialize.js";

export interface StoryboardDesignFrame {
  document: FinishedStoryboardDocument;
  timeMs: number;
  fingerprint: string;
  validation: ProducedTimelineIssue[];
}

/** Derive a review frame with the same composition used by finishing. */
export function buildStoryboardDesignFrame(
  input: Omit<FinishStoryboardInput, "current">,
  shotId: string,
  creativeContext?: {
    style?: string;
    context?: CreativeContext;
    entities?: readonly Entity[];
  }
): StoryboardDesignFrame {
  const shots = [...input.shots].sort(
    (left, right) => left.index - right.index
  );
  const shotIndex = shots.findIndex((shot) => shot.id === shotId);
  if (shotIndex < 0) {
    throw new Error(`Shot ${shotId} is not in this Storyboard.`);
  }
  const startMs = shots
    .slice(0, shotIndex)
    .reduce(
      (sum, shot) => sum + Math.max(1, (shot.duration_seconds ?? 4) * 1000),
      0
    );
  const durationMs = Math.max(
    1,
    (shots[shotIndex].duration_seconds ?? 4) * 1000
  );
  const result = materializeStoryboard(input);
  const semanticErrors = validateStoryboardSemantics(
    shots,
    {
      type: "screenplay",
      id: input.boardId,
      title: "",
      shots,
      motion_design: input.motionDesign
    },
    {
      assetIds: new Set(
        shots.flatMap((shot) => [
          ...(shot.graphics?.elements ?? []).flatMap((element) =>
            element.asset_id ? [element.asset_id] : []
          ),
          ...(shot.production?.protected_inputs ?? []).flatMap((value) =>
            value.asset_id ? [value.asset_id] : []
          )
        ])
      ),
      entityIds: new Set(
        shots.flatMap((shot) =>
          (shot.graphics?.elements ?? []).flatMap((element) =>
            element.entity_id ? [element.entity_id] : []
          )
        )
      )
    }
  );
  return {
    document: result.document,
    timeMs: startMs + durationMs / 2,
    fingerprint: stableSerialize({ input, shotId, creativeContext }),
    validation: [
      ...result.validation.filter(
        (issue) => issue.shotId === shotId || issue.shotId === ""
      ),
      ...semanticErrors.map(
        (message): ProducedTimelineIssue => ({
          code: "missing_element",
          shotId,
          elementId: "$intent",
          message
        })
      )
    ]
  };
}
