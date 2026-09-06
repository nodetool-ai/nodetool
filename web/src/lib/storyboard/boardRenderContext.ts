/**
 * The board values a render record is built from and compared against.
 *
 * One derivation, because it is read from both ends of the same comparison:
 * `useGenerateShot` stamps a version's {@link RenderInputs} with it at enqueue
 * time, and the stale banner, the card's pill and the `staleOnly` render tools
 * rebuild it to ask whether that version is still current. Two rules that
 * disagree would mark every version stale forever — the shots would offer to
 * re-render themselves for nothing, which is real money on a video model.
 *
 * It lived in three places before this, and two of them already disagreed on
 * which style entity wins.
 */

import type { BoardRenderContext, Entity } from "@nodetool-ai/protocol";

/** The parts of a board this reads. Structural, so a partial board fits. */
export interface RenderContextSource {
  aspectRatio?: string;
  style?: string;
  entityIds?: readonly string[];
  imageModel?: { id?: string } | null;
  videoModel?: { id?: string } | null;
  screenplay?: { scenes?: BoardRenderContext["scenes"] } | null;
}

/**
 * The board's style entity, or null.
 *
 * The last one wins. `setStylePreset` drops every style entity before adding
 * the chosen one, so a board it wrote carries exactly one and the choice does
 * not arise. It arises for a board that got its ids another way — a legacy
 * document, or an agent writing `entityIds` directly — and there the most
 * recently added is the one the creator last asked for.
 */
const styleEntityId = (
  entityIds: readonly string[] | undefined,
  entities: readonly Entity[]
): string | null => {
  if (!entityIds || entityIds.length === 0) {
    return null;
  }
  const styles = new Set(
    entities.filter((entity) => entity.kind === "style").map((entity) => entity.id)
  );
  for (let i = entityIds.length - 1; i >= 0; i -= 1) {
    if (styles.has(entityIds[i])) {
      return entityIds[i];
    }
  }
  return null;
};

/** Project a board and the resolved entity library onto the render inputs. */
export const boardRenderContext = (
  board: RenderContextSource | undefined | null,
  entities: readonly Entity[]
): BoardRenderContext => ({
  aspect_ratio: board?.aspectRatio ?? "16:9",
  image_model: board?.imageModel?.id ?? "",
  video_model: board?.videoModel?.id ?? "",
  style_entity_id: styleEntityId(board?.entityIds, entities),
  style: board?.style ?? "",
  scenes: board?.screenplay?.scenes ?? null
});
