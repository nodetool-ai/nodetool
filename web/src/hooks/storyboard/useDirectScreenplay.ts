/**
 * useDirectScreenplay
 *
 * Wires the Storyboard's "Direct" button to a real Director run: one
 * `generate_text` request against the board's brief, style, aspect ratio, cast
 * and requested shot count, answered as structured output against the
 * screenplay schema. No workflow, no job row — the same shape as the per-shot
 * renders in {@link useGenerateShot}, but board-scoped.
 *
 * The system prompt, the schema, the prompt shaping and the parse all come
 * from `@nodetool-ai/protocol`, so a screenplay directed here and one directed
 * by the `nodetool.creative.Director` node are authored the same way.
 */

import { useCallback, useState } from "react";
import {
  DIRECTOR_SYSTEM_PROMPT,
  SCREENPLAY_TOOL_DESCRIPTION,
  SCREENPLAY_TOOL_NAME,
  buildDirectorPrompt,
  buildScreenplaySchema,
  clampShotCount,
  fallbackScreenplay,
  parseScreenplay
} from "@nodetool-ai/protocol";
import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";

interface UseDirectScreenplayResult {
  direct: (boardId: string, shotCount: number) => Promise<void>;
  directing: boolean;
  error: string | null;
}

export const useDirectScreenplay = (): UseDirectScreenplayResult => {
  const [directing, setDirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: allEntities } = useEntities();

  const direct = useCallback(
    async (boardId: string, requestedShots: number): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const brief = board?.brief?.trim() ?? "";
      if (brief.length === 0) {
        setError("Write a brief before directing.");
        return;
      }
      // Tell the Director about the board's cast so the screenplay references
      // entities by their exact names (which is what activates them per shot).
      const entitiesMap = new Map(allEntities?.map((e) => [e.id, e]));
      const cast = (board?.entityIds ?? [])
        .map((id) => entitiesMap.get(id))
        .filter((e): e is NonNullable<typeof e> => !!e);
      const castLines = cast.map(
        (e) => `- ${e.name} (${e.kind})${e.descriptor ? `: ${e.descriptor}` : ""}`
      );
      // The cast reaches the model but not the fallback: placeholder shots are
      // built from the brief the user wrote, not from a reference block.
      const directedBrief =
        castLines.length > 0
          ? `${brief}\n\nCast & ingredients — reference these by exact name in the shots:\n${castLines.join("\n")}`
          : brief;
      const model = board?.directorModel;
      if (!model?.id) {
        setError("Pick a model before directing.");
        return;
      }
      setError(null);
      setDirecting(true);

      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const shotCount = clampShotCount(requestedShots);

      try {
        const result = await rpcRequest("generate_text", {
          provider: model.provider,
          model: model.id,
          system: DIRECTOR_SYSTEM_PROMPT,
          prompt: buildDirectorPrompt(
            directedBrief,
            style,
            shotCount,
            aspectRatio
          ),
          max_tokens: 8192,
          schema: buildScreenplaySchema(shotCount),
          schema_name: SCREENPLAY_TOOL_NAME,
          schema_description: SCREENPLAY_TOOL_DESCRIPTION
        });
        const parsed = result.data
          ? parseScreenplay(result.data, { shotCount, aspectRatio })
          : null;
        // No usable answer — a provider without tool support, or the fake
        // provider — falls back to placeholder shots derived from the brief,
        // the same rule the Director node applies. The board keeps flowing
        // and the user can edit the beats; only a provider error throws.
        const screenplay =
          parsed && parsed.shots.length > 0
            ? parsed
            : fallbackScreenplay({ brief, style, shotCount, aspectRatio });
        useStoryboardStore.getState().setScreenplay(boardId, screenplay);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDirecting(false);
      }
    },
    [allEntities]
  );

  return { direct, directing, error };
};

export default useDirectScreenplay;
