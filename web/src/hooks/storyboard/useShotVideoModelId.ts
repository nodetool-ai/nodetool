import type { Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

/**
 * The model id a shot's clip renders with: the model remembered on the shot,
 * else the board's video model, as `ShotRenderDialog` opens on. Null when
 * neither is set.
 */
export const useShotVideoModelId = (
  boardId: string,
  shot: Pick<Shot, "clip_model">
): string | null =>
  useStoryboardStore(
    (state) =>
      shot.clip_model?.id ?? state.boards[boardId]?.videoModel?.id ?? null
  );
