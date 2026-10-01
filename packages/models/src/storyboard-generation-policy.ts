import { assertProductionGenerationAllowed, productionRequirement } from "@nodetool-ai/protocol";
import { Storyboard } from "./storyboard.js";
import type { TimelineDocument } from "./timeline-sequence.js";

/** Check a clip read from an authorized persisted Timeline against its current shot policy. */
export async function assertStoryboardClipGenerationAllowed(
  userId: string,
  projectId: string,
  clip: Pick<TimelineDocument["clips"][number], "storyboardBoardId" | "storyboardShotId">,
  capability: Parameters<typeof assertProductionGenerationAllowed>[1]
): Promise<void> {
  if (!clip.storyboardBoardId) { return; }
  const board = await Storyboard.findById(clip.storyboardBoardId);
  if (!board || board.user_id !== userId || board.project_id !== projectId) {
    throw new Error("Storyboard generation context was not found in the caller's project.");
  }
  const shot = board.toDocument().shots.find((value) => value.id === clip.storyboardShotId);
  if (!shot) { throw new Error("Storyboard generation source shot was not found."); }
  assertProductionGenerationAllowed(shot.production === undefined ? undefined : productionRequirement.parse(shot.production), capability);
}
