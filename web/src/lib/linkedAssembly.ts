/**
 * linkedAssembly — reading the counterpart document a joint assemble needs.
 *
 * A linked board is cut against its script's takes, and a linked script is cut
 * against its board's shots. Either counterpart may be open in its store (with
 * edits the server has not seen yet) or exist only on the server, so both
 * loaders read the store first and fall back to a fetch.
 *
 * A counterpart that cannot be read is `null`, never a throw: the link points
 * at a document that was deleted or is briefly unreachable, and the caller
 * assembles the unlinked way rather than failing the click.
 */

import type { Shot } from "@nodetool-ai/protocol";
import type { ScriptAssemblyInput } from "@nodetool-ai/timeline";

import { trpcClient } from "../trpc/client";
import { useScriptStore } from "../stores/script/ScriptStore";
import { useStoryboardStore } from "../stores/storyboard/StoryboardStore";

/** The board half of a joint assemble: the picture and the score direction. */
export interface LinkedBoardInput {
  boardId: string;
  shots: Shot[];
  musicPrompt?: string | null;
}

/** The script this board links, ready to assemble, or null when unreadable. */
export async function loadLinkedScript(
  scriptId: string
): Promise<ScriptAssemblyInput | null> {
  const open = useScriptStore.getState().getScript(scriptId);
  // A script tab that has only been ensured carries no sections yet; the server
  // copy is the one with the takes.
  if (open && open.sections.length > 0) {
    return { scriptId, cast: open.cast, sections: open.sections };
  }
  try {
    const response = await trpcClient.scripts.get.query({ id: scriptId });
    return {
      scriptId,
      cast: response.document.cast,
      sections: response.document.sections
    };
  } catch (error) {
    console.warn(
      `Linked script ${scriptId} could not be read; assembling without it:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** The board this script links, ready to assemble, or null when unreadable. */
export async function loadLinkedBoard(
  boardId: string
): Promise<LinkedBoardInput | null> {
  const open = useStoryboardStore.getState().getBoard(boardId);
  if (open && open.shots.length > 0) {
    return {
      boardId,
      shots: open.shots,
      musicPrompt: open.screenplay?.music_prompt
    };
  }
  try {
    const response = await trpcClient.storyboards.get.query({ id: boardId });
    const document = response.document;
    // SAFETY: `storyboardResponse` mirrors `Shot`/`Screenplay` as passthrough
    // zod objects — the same payload described structurally here and nominally
    // there (see useStoryboardServerSync).
    const shots = document.shots as Shot[];
    const screenplay = document.screenplay as { music_prompt?: string } | null;
    return { boardId, shots, musicPrompt: screenplay?.music_prompt };
  } catch (error) {
    console.warn(
      `Linked storyboard ${boardId} could not be read; assembling without it:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
