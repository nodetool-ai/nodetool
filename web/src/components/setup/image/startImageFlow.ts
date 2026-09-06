/**
 * Starting the image flow from an entry card (PRD § 6.1, § 10.1, D2).
 *
 * Explicit: nothing typed in the New Project prompt box reaches the flow
 * unless the Image card is clicked. The document is created with its stage
 * already at `idea` and the typed prompt as its brief, so the flow resumes
 * from the document alone (D3) and the host only has to open the tab.
 *
 * The prompt is not the only thing the composer holds. Reference images and
 * picked entities travel too, on the same document, so the step that refines
 * the brief can look at the picture the creator attached instead of dropping
 * it (F4). Both are optional: a caller that passes neither writes exactly the
 * document this function has always written.
 */

import { trpcClient } from "../../../trpc/client";
import {
  MAX_IMAGE_REFERENCES,
  type ImageReference
} from "./setupContext";

export type { ImageReference };

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
  /** Pictures attached to the prompt, at most {@link MAX_IMAGE_REFERENCES}. */
  references?: readonly ImageReference[];
  /** Entities picked beside the prompt. */
  entityIds?: readonly string[];
}): Promise<StartedImageFlow> {
  const created = await trpcClient.sketch.create.mutate({
    name: options.name,
    projectId: options.projectId,
    width: DEFAULT_CANVAS,
    height: DEFAULT_CANVAS
  });
  const references = (options.references ?? []).slice(0, MAX_IMAGE_REFERENCES);
  const entityIds = options.entityIds ?? [];
  // Absent rather than empty, so a document started with no context reads
  // exactly as it did before these fields existed.
  const context: {
    references?: typeof references;
    entity_ids?: typeof entityIds;
  } = {};
  if (references.length > 0) {
    context.references = references;
  }
  if (entityIds.length > 0) {
    context.entity_ids = entityIds;
  }

  // `sketch.create` takes no document, so the stage is written by the one
  // patch that follows it — before the tab opens, so the editor never flashes.
  await trpcClient.sketch.update.mutate({
    id: created.id,
    document: {
      ...created.document,
      sketch: {
        ...created.document.sketch,
        setup: {
          stage: "idea",
          brief: options.brief.trim(),
          ...context
        }
      }
    }
  });
  return { documentId: created.id, name: options.name };
}
