/**
 * Whether an image model supports a task, for a caller that picks the
 * capability before it dispatches (a storyboard still with entity references).
 */

import type { ProcessingContext } from "./context.js";

/**
 * An instruction editor: the model takes an image and a prompt that names
 * a change, and it returns the same image with that change. `image_to_image`
 * alone also covers generators that take an optional start image (flux-dev,
 * SDXL fine-tunes) and restorers, so a surface that edits a still filters on
 * this task instead.
 */
export const IMAGE_EDIT_TASK = "image_edit";

// Catalogs do not declare which image_to_image models follow an edit
// instruction, so the id or name decides. A dedicated endpoint carries "edit"
// in its id; the families below edit through their main endpoint.
const IMAGE_EDIT_PATTERN = new RegExp(
  [
    "(?:^|[^a-z])edit(?:s|ing|or)?(?:[^a-z]|$)",
    "kontext",
    "seededit",
    "nano[\\s_-]?banana",
    "gpt[\\s_-]?image",
    "gpt-5(?:\\.\\d+)?-image",
    "gemini[\\w.-]*image",
    "seedream[\\s_-]*v?[4-9]",
    "flux[\\s._-]?2",
    "grok[\\s_-]imagine",
    "riverflow[\\w.-]*-(?:fast|pro)",
    "step1x",
    "omnigen",
    "bagel"
  ].join("|"),
  "i"
);

/** Whether an image model follows an edit instruction on a source image. */
export function isImageEditModel(model: {
  id: string;
  name: string;
  supportedTasks?: readonly string[];
}): boolean {
  const tasks = model.supportedTasks ?? [];
  if (tasks.includes(IMAGE_EDIT_TASK)) return true;
  if (!tasks.includes("image_to_image")) return false;
  return IMAGE_EDIT_PATTERN.test(`${model.id} ${model.name}`);
}

/** The model's task list, with `image_edit` added when it is an editor. */
export function imageModelTasks(model: {
  id: string;
  name: string;
  supportedTasks?: string[];
}): string[] | undefined {
  const tasks = model.supportedTasks;
  if (!tasks || tasks.includes(IMAGE_EDIT_TASK)) return tasks;
  return isImageEditModel(model) ? [...tasks, IMAGE_EDIT_TASK] : tasks;
}

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
    return entry ? (imageModelTasks(entry)?.includes(task) ?? false) : false;
  } catch {
    // A provider without credentials or catalog renders text-only.
    return false;
  }
}
