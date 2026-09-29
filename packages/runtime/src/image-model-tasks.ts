/**
 * Whether an image model supports a task, for a caller that picks the
 * capability before it dispatches (a storyboard still with entity references).
 */

import type { ProcessingContext } from "./context.js";

/**
 * Read `declared` when the caller holds a non-empty task list for the model.
 * Otherwise ask the provider's image catalog. An unknown model or an
 * unreachable catalog answers false, so the caller keeps its plain path.
 */
export async function imageModelSupportsTask(
  context: ProcessingContext,
  model: { provider: string; model: string },
  task: string,
  declared?: readonly string[]
): Promise<boolean> {
  if (declared && declared.length > 0) return declared.includes(task);
  try {
    const provider = await context.getProvider(model.provider);
    const models = await provider.getAvailableImageModels();
    const entry = models.find((candidate) => candidate.id === model.model);
    return entry?.supportedTasks?.includes(task) ?? false;
  } catch {
    // A provider without credentials or catalog renders text-only.
    return false;
  }
}
