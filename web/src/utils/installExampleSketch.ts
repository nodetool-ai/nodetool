import { newDocumentId } from "../lib/newDocumentId";
import { trpcClient } from "../trpc/client";
import {
  buildExampleSketch,
  EXAMPLE_SKETCH_HEIGHT,
  EXAMPLE_SKETCH_WIDTH,
  type ExampleSketch
} from "./exampleSketches";

/**
 * Create an editable copy of a shipped sketch in a project. A copy whose
 * document cannot be written is deleted again so no empty sketch is left.
 */
export async function installExampleSketch(
  example: ExampleSketch,
  projectId: string
) {
  const document = await buildExampleSketch(example);
  const created = await trpcClient.sketch.create.mutate({
    id: newDocumentId(),
    name: example.name,
    projectId,
    backgroundColor: document.sketch.canvas.backgroundColor,
    width: EXAMPLE_SKETCH_WIDTH,
    height: EXAMPLE_SKETCH_HEIGHT
  });
  try {
    return await trpcClient.sketch.update.mutate({
      id: created.id,
      document
    });
  } catch (error) {
    await trpcClient.sketch.delete.mutate({ id: created.id });
    throw error;
  }
}
