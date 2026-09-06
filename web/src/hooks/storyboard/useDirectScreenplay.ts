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
 *
 * An imported script is directed differently (D10). An FDX already carries the
 * words and the scene order, so the run asks for camera, motion and duration
 * only and `verifyImportedText` restores anything the answer changed. A PDF or
 * DOCX has no structure to keep, so it is directed normally and the same
 * post-check flags the source lines no shot picked up.
 */

import { useCallback, useRef, useState } from "react";
import type { Screenplay } from "@nodetool-ai/protocol";
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
import type { FdxImport } from "../../lib/storyboard/parseFdx";
import { directionFingerprint } from "./directionFingerprint";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";
import {
  CAMERA_PASS_SYSTEM_PROMPT,
  CAMERA_PASS_TOOL_DESCRIPTION,
  CAMERA_PASS_TOOL_NAME,
  applyCameraPass,
  buildCameraPassPrompt,
  buildCameraPassSchema
} from "../../lib/storyboard/cameraPass";
import {
  getImportSource,
  setImportNotice
} from "../../lib/storyboard/importSource";
import {
  describeDirectorFailure,
  directorFailureText
} from "../../lib/storyboard/providerError";
import {
  verifyImportedFdx,
  verifyImportedPlainText
} from "../../lib/storyboard/verifyImportedText";

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
  /**
   * The same reason as {@link UseDirectScreenplayResult.error}, written before
   * `direct` resolves. A caller that reads the reason in the continuation of
   * its own `await` — the setup flow, which turns a refused run into a throw —
   * cannot use the state: that lands a render later, and the flow would report
   * a generic message instead of what the provider said.
   */
  errorRef: React.RefObject<string | null>;
  /**
   * True when the last run produced the local placeholder outline instead of a
   * screenplay the model wrote — a provider without structured output, or an
   * answer with no shots in it. The review step says so and lets the creator
   * keep it or run the Director again, rather than presenting a locally
   * generated draft as the model's work (F9).
   */
  usedFallback: boolean;
  /** The creator kept the placeholder outline. Drops the notice. */
  acceptFallback: () => void;
}

export const useDirectScreenplay = (): UseDirectScreenplayResult => {
  const [directing, setDirecting] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const setError = useCallback((message: string | null) => {
    errorRef.current = message;
    setErrorState(message);
  }, []);
  const { data: allEntities } = useEntities();

  const direct = useCallback(
    async (boardId: string, requestedShots: number): Promise<boolean> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const imported = getImportSource(boardId);
      const brief = board?.brief?.trim() ?? "";
      // An imported script that is used verbatim carries the words itself, so
      // the brief beside it is optional (F3).
      if (brief.length === 0 && imported?.preserveWords !== true) {
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
      setUsedFallback(false);
      setDirecting(true);

      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      // Picked in step 2 before any screenplay exists, so it comes off the
      // board rather than from the caller (PRD § 7.2, criterion 3).
      const genre = board?.genre ?? "";
      const shotCount = clampShotCount(requestedShots);

      // What this run answers, recorded on the board when it lands. The genre
      // step reads it back to decide whether its button continues to the
      // screenplay or offers a re-direct (F15). The headless path runs through
      // here too, so both write the same value.
      const directedFrom = directionFingerprint({
        brief,
        genre,
        shotCount: requestedShots,
        modelId: model.id,
        importKind: imported?.kind ?? "none"
      });

      // The imported script is the board, not a copy kept beside it: the
      // scenes, the shots and the text the run must preserve are the ones the
      // creator has been reading and editing (PRD § 7.7, F3).
      const preserved: FdxImport | null =
        imported?.preserveWords === true && (board?.shots.length ?? 0) > 0
          ? {
              scenes: board?.screenplay?.scenes ?? [],
              shots: board?.shots ?? [],
              text: board?.brief ?? ""
            }
          : null;

      try {
        if (preserved) {
          const answer = await rpcRequest("generate_text", {
            provider: model.provider,
            model: model.id,
            system: CAMERA_PASS_SYSTEM_PROMPT,
            prompt: buildCameraPassPrompt(preserved, genre, style),
            max_tokens: 4096,
            schema: buildCameraPassSchema(
              preserved.shots.map((shot) => shot.id)
            ),
            schema_name: CAMERA_PASS_TOOL_NAME,
            schema_description: CAMERA_PASS_TOOL_DESCRIPTION
          });
          const returned = applyCameraPass(preserved, answer.data);
          const verified = verifyImportedFdx(preserved, returned);
          const store = useStoryboardStore.getState();
          const screenplay: Screenplay = {
            type: "screenplay",
            id: `fdx-${boardId}`,
            title: board?.title ?? "",
            shots: verified.shots,
            scenes: verified.scenes,
            genre,
            aspect_ratio: aspectRatio
          };
          store.setScreenplay(boardId, screenplay);
          store.setSetup(boardId, { directedFrom });
          setImportNotice(boardId, {
            kind: "fdx",
            correctedShotIds: verified.correctedShotIds
          });
          if (store.getBoard(boardId)?.setupStage === "genre") {
            store.setSetup(boardId, { stage: "review" });
          }
          return true;
        }

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
        const fell = !parsed || parsed.shots.length === 0;
        const screenplay = fell
          ? fallbackScreenplay({ brief, style, shotCount, aspectRatio })
          : parsed;
        // The review step names it as locally written, so nobody edits a
        // placeholder believing the Director wrote it (F9).
        setUsedFallback(fell);
        const store = useStoryboardStore.getState();
        store.setScreenplay(boardId, screenplay);
        store.setSetup(boardId, { directedFrom });
        if (imported && !imported.preserveWords) {
          // The source text is the brief the creator is looking at, so the
          // check names the lines their own words did not reach.
          const check = verifyImportedPlainText(brief, screenplay.shots);
          setImportNotice(boardId, {
            kind: "text",
            missingLines: check.missingLines
          });
        }
        // Only a run that was waiting for its screenplay moves the stage on.
        // The same hook drives the board's own Direct button, where the board
        // is finished (`done`) and must not be thrown back into setup.
        if (store.getBoard(boardId)?.setupStage === "genre") {
          store.setSetup(boardId, { stage: "review" });
        }
        return true;
      } catch (err) {
        // The provider's own words, rewritten as one sentence plus the thing
        // to try next — the raw body carries a status code, a JSON blob and a
        // billing URL, and reads as a crash under a guided step.
        setError(
          directorFailureText(
            describeDirectorFailure(
              err instanceof Error ? err.message : String(err),
              model
            )
          )
        );
        return false;
      } finally {
        setDirecting(false);
      }
    },
    [allEntities, setError]
  );

  return {
    direct,
    directing,
    error,
    errorRef,
    usedFallback,
    acceptFallback: useCallback(() => setUsedFallback(false), [])
  };
};

export default useDirectScreenplay;
