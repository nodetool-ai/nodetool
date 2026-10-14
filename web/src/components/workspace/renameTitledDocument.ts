import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../stores/script/ScriptStore";

/**
 * Persist the document title before publishing it to its editor and tab. A
 * document no editor has loaded reads its revision from the server first.
 */
export async function renameTitledDocument(
  type: "storyboard" | "script",
  id: string,
  name: string
): Promise<void> {
  if (type === "storyboard") {
    const store = useStoryboardStore.getState();
    const loadedRevision = store.serverRevisions[id];
    const revision =
      loadedRevision ??
      (await trpcClient.storyboards.get.query({ id })).updatedAt;
    const updated = await trpcClient.storyboards.update.mutate({
      id,
      name,
      baseUpdatedAt: revision
    });
    if (loadedRevision) {
      store.setServerRevision(id, updated.updatedAt);
      store.setTitle(id, name);
    }
  } else {
    const store = useScriptStore.getState();
    const loadedRevision = store.serverRevisions[id];
    const revision =
      loadedRevision ?? (await trpcClient.scripts.get.query({ id })).updatedAt;
    const updated = await trpcClient.scripts.update.mutate({
      id,
      name,
      baseUpdatedAt: revision
    });
    if (loadedRevision) {
      store.setServerRevision(id, updated.updatedAt);
      store.setTitle(id, name);
    }
  }
}
