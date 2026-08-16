/**
 * The script side of the script ↔ storyboard link: the persisted
 * `scripts.storyboard_id` back-pointer (design §1.2).
 *
 * The board owns the link — `Screenplay.script_id` is what validation reads —
 * and this column is what the script header navigates by, so it has to survive
 * a reload. Every write goes through the scripts CAS patch here rather than
 * relying on the editor's autosave: the script whose pointer changes often has
 * no tab open (a board extracted from the storyboard side, a board deleted from
 * the sidebar), and autosave only runs for a mounted tab.
 */

import { trpcClient } from "../trpc/client";
import { useScriptStore } from "../stores/script/ScriptStore";

/**
 * Point `scriptId` at `storyboardId` (or clear it with `null`), CAS on the
 * script's `updatedAt`, then mirror it into the store. Throws what tRPC throws,
 * so a caller that created a resource can report the failed second write.
 */
export async function writeScriptStoryboardId(
  scriptId: string,
  storyboardId: string | null
): Promise<void> {
  const current = await trpcClient.scripts.get.query({ id: scriptId });
  const updated = await trpcClient.scripts.update.mutate({
    id: scriptId,
    baseUpdatedAt: current.updatedAt,
    storyboardId
  });
  // The open tab's autosave holds the old CAS token; hand it the new one so its
  // next save is not a spurious conflict that reloads over the user's edits.
  useScriptStore.getState().setServerRevision(scriptId, updated.updatedAt);
  useScriptStore.getState().setStoryboardLink(scriptId, storyboardId);
}
