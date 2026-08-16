/**
 * Deletion downgrades for the script ↔ storyboard link (design §4).
 *
 * Deleting a linked script leaves its board unlinked but whole: the link
 * fields go, the projected dialogue and narration stay as ordinary shot text.
 * Deleting a board clears the script's back-pointer. Both run beside the
 * delete and never block it — a downgrade that fails is logged, and the
 * document it could not reach keeps a link to something that is gone, which
 * `validateScriptLink` reports as a warning rather than a broken board.
 */

import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { trpcClient } from "../trpc/client";
import { useScriptStore } from "../stores/script/ScriptStore";
import { useStoryboardStore } from "../stores/storyboard/StoryboardStore";
import { unlinkedScreenplay, unlinkedShots } from "./scriptStoryboardLink";

type StoryboardDocument = Awaited<
  ReturnType<typeof trpcClient.storyboards.get.query>
>["document"];

/**
 * Unlink every board that references `scriptId`. Returns the ids downgraded,
 * so a caller can invalidate their caches. Never throws.
 */
export async function downgradeBoardsLinkedToScript(
  scriptId: string
): Promise<string[]> {
  const downgraded: string[] = [];
  let boards: Array<{ id: string }> = [];
  try {
    boards = await trpcClient.storyboards.list.query({});
  } catch (error) {
    console.error("Could not list storyboards to unlink the deleted script", error);
    return downgraded;
  }

  for (const item of boards) {
    try {
      const board = await trpcClient.storyboards.get.query({ id: item.id });
      if (board.document.screenplay?.script_id !== scriptId) {
        continue;
      }
      // SAFETY: the wire document's `screenplay`/`shots` are the passthrough
      // zod mirrors of `Screenplay`/`Shot` — the same payload described twice,
      // once structurally and once nominally (see useStoryboardServerSync).
      const screenplay = unlinkedScreenplay(
        board.document.screenplay as Screenplay | null
      );
      const shots = unlinkedShots(board.document.shots as Shot[]);
      await trpcClient.storyboards.update.mutate({
        id: item.id,
        baseUpdatedAt: board.updatedAt,
        document: {
          ...board.document,
          screenplay: screenplay ? { ...screenplay, shots } : null,
          shots
        } as StoryboardDocument
      });
      useStoryboardStore.getState().clearScriptLink(item.id);
      downgraded.push(item.id);
    } catch (error) {
      console.error(`Could not unlink storyboard ${item.id} from the deleted script`, error);
    }
  }
  return downgraded;
}

/**
 * Forget the deleted board on the script side. The persisted back-pointer
 * (`scripts.storyboard_id`) is a separate change, so today this clears the
 * session-scoped link the script editor navigates by.
 */
export function downgradeScriptsLinkedToBoard(storyboardId: string): void {
  useScriptStore.getState().clearStoryboardLink(storyboardId);
}
