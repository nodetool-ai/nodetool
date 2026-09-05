/**
 * The Studio prompt-first start (design §4).
 *
 * One prompt, one pass, and the user lands on a linked pair instead of an
 * empty document: the prompt becomes a board's brief, the Director drafts the
 * shots, and the words are projected straight back out into a linked script.
 * Every step is an existing surface — `useDirectScreenplay` and
 * `useExtractScriptFromBoard` — so the pair is stamped by the same code the
 * editors use, and the curated Studio models are stamped at creation so
 * nothing waits for a dropdown.
 */

import { useCallback, useRef, useState } from "react";

import { trpcClient } from "../trpc/client";
import { newDocumentId } from "../lib/newDocumentId";
import { useStoryboardStore } from "../stores/storyboard/StoryboardStore";
import { useDirectScreenplay } from "../hooks/storyboard/useDirectScreenplay";
import { useExtractScriptFromBoard } from "../hooks/storyboard/useExtractScriptFromBoard";
import {
  STUDIO_CLIP_MODEL,
  STUDIO_DIRECTOR_MODEL,
  STUDIO_STILL_MODEL
} from "./curatedModels";

type StoryboardWireDocument = Awaited<
  ReturnType<typeof trpcClient.storyboards.get.query>
>["document"];

/** Shots the first pass drafts — the storyboard editor's own default. */
const DEFAULT_SHOT_COUNT = 6;
const ASPECT_RATIO = "16:9";

export type StudioPromptStage = "idle" | "directing" | "writing";

interface StudioPromptStartResult {
  boardId: string;
  scriptId: string;
}

interface UseStudioPromptStartResult {
  start: (prompt: string) => Promise<StudioPromptStartResult>;
  stage: StudioPromptStage;
  busy: boolean;
  error: string | null;
}

/** A card title out of the prompt: its first clause, kept short. */
export const projectNameFromPrompt = (prompt: string): string => {
  const firstLine = prompt.trim().split("\n")[0].trim();
  const clause = firstLine.split(/[.!?]/)[0].trim() || firstLine;
  if (clause.length <= 60) return clause || "Untitled project";
  return `${clause.slice(0, 57).trimEnd()}…`;
};

export const useStudioPromptStart = (): UseStudioPromptStartResult => {
  const { direct } = useDirectScreenplay();
  const { extract } = useExtractScriptFromBoard();
  const [stage, setStage] = useState<StudioPromptStage>("idle");
  const [error, setError] = useState<string | null>(null);
  // One start at a time: the caller's button disables too, but a double
  // activation must not create two projects or race the navigation.
  const running = useRef(false);

  const start = useCallback(
    async (prompt: string): Promise<StudioPromptStartResult> => {
      const brief = prompt.trim();
      if (brief.length === 0) {
        throw new Error("Describe the video before starting.");
      }
      if (running.current) {
        throw new Error("A project is already being created.");
      }
      running.current = true;
      setError(null);
      setStage("directing");
      try {
        const boardId = newDocumentId();
        const name = projectNameFromPrompt(brief);
        const document = {
          screenplay: null,
          shots: [],
          brief,
          style: "",
          entityIds: [],
          aspectRatio: ASPECT_RATIO,
          setupStage: "done",
          genre: "",
          directorModel: STUDIO_DIRECTOR_MODEL,
          imageModel: STUDIO_STILL_MODEL,
          videoModel: STUDIO_CLIP_MODEL
        } as unknown as StoryboardWireDocument;
        await trpcClient.storyboards.create.mutate({
          id: boardId,
          name,
          document
        });
        useStoryboardStore.getState().loadBoard(boardId, {
          screenplay: null,
          shots: [],
          title: name,
          brief,
          style: "",
          entityIds: [],
          aspectRatio: ASPECT_RATIO,
          setupStage: "done",
          genre: "",
          directorModel: STUDIO_DIRECTOR_MODEL,
          imageModel: STUDIO_STILL_MODEL,
          videoModel: STUDIO_CLIP_MODEL,
          activeShotId: null,
          timelineId: null
        });

        await direct(boardId, DEFAULT_SHOT_COUNT);
        // `direct` reports its failures through its own state and resolves
        // either way, so the board itself is the verdict.
        const drafted = useStoryboardStore.getState().getBoard(boardId);
        if (!drafted || drafted.shots.length === 0) {
          throw new Error(
            "The director did not draft any shots. Open the storyboard and try again."
          );
        }

        setStage("writing");
        const { scriptId } = await extract(boardId, { open: false });
        return { boardId, scriptId };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        running.current = false;
        setStage("idle");
      }
    },
    [direct, extract]
  );

  return { start, stage, busy: stage !== "idle", error };
};

export default useStudioPromptStart;
