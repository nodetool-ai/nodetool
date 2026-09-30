import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../stores/script/ScriptStore";

/** Persist the document title before publishing it to its editor and tab. */
export async function renameTitledDocument(
  type: "storyboard" | "script",
  id: string,
  name: string
): Promise<void> {
  if (type === "storyboard") {
    const store = useStoryboardStore.getState();
    const revision = store.serverRevisions[id];
    if (!revision) {
      throw new Error("Storyboard must finish loading before it can be renamed");
    }
    const updated = await trpcClient.storyboards.update.mutate({
      id,
      name,
      baseUpdatedAt: revision
    });
    store.setServerRevision(id, updated.updatedAt);
    store.setTitle(id, name);
  } else {
    const store = useScriptStore.getState();
    const revision = store.serverRevisions[id];
    if (!revision) {
      throw new Error("Script must finish loading before it can be renamed");
    }
    const updated = await trpcClient.scripts.update.mutate({
      id,
      name,
      baseUpdatedAt: revision
    });
    store.setServerRevision(id, updated.updatedAt);
    store.setTitle(id, name);
  }
}
