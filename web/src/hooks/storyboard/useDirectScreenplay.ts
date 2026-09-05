/**
 * useDirectScreenplay
 *
 * Wires the Storyboard's "Direct" button — and the setup flow's "Review your
 * screenplay" — to a real Director run: one `generate_text` request against the
 * board's brief, genre, style, aspect ratio, cast and requested shot count,
 * answered as structured output against the screenplay schema. No workflow and
 * no job row — the same shape as the per-shot renders in
 * {@link useGenerateShot}, but board-scoped.
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
  /**
   * Run the Director for a board. Resolves `true` when a screenplay was
   * applied and `false` when the run was refused or the provider failed — the
   * message is in {@link UseDirectScreenplayResult.error}. It never rejects,
   * because the board surface fires it from a click handler; a caller that
   * must not advance on failure (the setup flow's genre step) reads the
   * boolean.
   */
  direct: (boardId: string, shotCount: number) => Promise<boolean>;
  directing: boolean;
  error: string | null;
}

export const useDirectScreenplay = (): UseDirectScreenplayResult => {
  const [directing, setDirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: allEntities } = useEntities();

  const direct = useCallback(
    async (boardId: string, requestedShots: number): Promise<boolean> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const brief = board?.brief?.trim() ?? "";
      if (brief.length === 0) {
        setError("Write a brief before directing.");
        return false;
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
        return false;
      }
      setError(null);
      setDirecting(true);

      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      // Picked in step 2 before any screenplay exists, so it comes off the
      // board rather than from the caller (PRD § 7.2, criterion 3).
      const genre = board?.genre ?? "";
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
            aspectRatio,
            genre
          ),
          max_tokens: 8192,
          schema: buildScreenplaySchema(shotCount),
          schema_name: SCREENPLAY_TOOL_NAME,
          schema_description: SCREENPLAY_TOOL_DESCRIPTION
        });
        const parsed = result.data
          ? parseScreenplay(result.data, { shotCount, aspectRatio, genre })
          : null;
        // No usable answer — a provider without tool support, or the fake
        // provider — falls back to placeholder shots derived from the brief,
        // the same rule the Director node applies. The board keeps flowing
        // and the user can edit the beats; only a provider error throws.
        const screenplay =
          parsed && parsed.shots.length > 0
            ? parsed
            : fallbackScreenplay({ brief, style, shotCount, aspectRatio });
        const store = useStoryboardStore.getState();
        store.setScreenplay(boardId, screenplay);
        // Only a run that was waiting for its screenplay moves the stage on.
        // The same hook drives the board's own Direct button, where the board
        // is finished (`done`) and must not be thrown back into setup.
        if (store.getBoard(boardId)?.setupStage === "genre") {
          store.setSetup(boardId, { stage: "review" });
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setDirecting(false);
      }
    },
    [allEntities]
  );

  return { direct, directing, error };
};

export default useDirectScreenplay;
