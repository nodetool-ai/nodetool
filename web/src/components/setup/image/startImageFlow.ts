/**
 * Starting the image flow from an entry card (PRD § 6.1, § 10.1, D2).
 *
 * Explicit: nothing typed in the New Project prompt box reaches the flow
 * unless the Image card is clicked. The document is created with its stage
 * already at `idea` and the typed prompt as its brief, so the flow resumes
 * from the document alone (D3) and the host only has to open the tab.
 */

import { trpcClient } from "../../../trpc/client";

/** Canvas the flow opens on, before a use case picks a size (PRD § 10.2). */
const DEFAULT_CANVAS = 1024;

export interface StartedImageFlow {
  documentId: string;
  name: string;
}

export async function startImageFlow(options: {
  name: string;
  projectId: string;
  /** What the creator typed. Becomes the document's brief. */
  brief: string;
}): Promise<StartedImageFlow> {
  const created = await trpcClient.sketch.create.mutate({
    name: options.name,
    projectId: options.projectId,
    width: DEFAULT_CANVAS,
    height: DEFAULT_CANVAS
  });
  // `sketch.create` takes no document, so the stage is written by the one
  // patch that follows it — before the tab opens, so the editor never flashes.
  await trpcClient.sketch.update.mutate({
    id: created.id,
    document: {
      ...created.document,
      sketch: {
        ...created.document.sketch,
        setup: { stage: "idea", brief: options.brief.trim() }
      }
    }
  });
  return { documentId: created.id, name: options.name };
}
