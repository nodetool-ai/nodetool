import useModelPreferencesStore from "../stores/ModelPreferencesStore";
import type { DefaultModel } from "../stores/ModelPreferencesStore";
import {
  IMAGE_TASK_BY_NODE_TYPE,
  VIDEO_TASK_BY_NODE_TYPE,
  modelMatchesTask
} from "../hooks/modelTaskMatching";
import { isString } from "./typePredicates";

// Property types stamped with the user's default model on node creation.
// `code_model` is deliberately absent: it selects the model that authors Code
// Node code and is never stored on a node.
const MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

interface PropertyMeta {
  name: string;
  type: { type: string } | string;
}

// Image tasks whose models are not generators, so they get a default of their
// own. Keyed `image_model:<task>` in the preferences store.
export const IMAGE_TASK_DEFAULTS = {
  "nodetool.image.Upscale": "image_model:upscale",
  "nodetool.image.RemoveBackground": "image_model:remove_background"
} as const satisfies Record<string, string>;

function getTypeString(type: { type: string } | string): string {
  return isString(type) ? type : type.type;
}

function defaultKeyFor(modelType: string, nodeType: string | undefined): string {
  if (modelType === "image_model" && nodeType && nodeType in IMAGE_TASK_DEFAULTS) {
    return IMAGE_TASK_DEFAULTS[nodeType as keyof typeof IMAGE_TASK_DEFAULTS];
  }
  return modelType;
}

function requiredTasks(
  modelType: string,
  nodeType: string | undefined
): string[] {
  if (!nodeType) {
    return [];
  }
  const task =
    modelType === "image_model"
      ? IMAGE_TASK_BY_NODE_TYPE[nodeType]
      : modelType === "video_model"
        ? VIDEO_TASK_BY_NODE_TYPE[nodeType]
        : undefined;
  if (task === undefined) {
    return [];
  }
  return Array.isArray(task) ? task : [task];
}

// Same rule as the node's model picker. A pin saved without its tasks is not
// checked.
function supportsNodeTask(
  model: DefaultModel,
  modelType: string,
  nodeType: string | undefined
): boolean {
  const tasks = requiredTasks(modelType, nodeType);
  if (tasks.length === 0 || model.supported_tasks === undefined) {
    return true;
  }
  return tasks.some((task) => modelMatchesTask(model.supported_tasks, task));
}

/** Fill empty model properties with the user's pinned defaults. */
export function applyDefaultModels(
  properties: Record<string, unknown>,
  propertyMetadata: PropertyMeta[],
  nodeType?: string
) {
  const defaults = useModelPreferencesStore.getState().defaults;
  if (Object.keys(defaults).length === 0) return properties;

  const result = { ...properties };

  for (const prop of propertyMetadata) {
    const modelType = getTypeString(prop.type);
    if (!MODEL_TYPES.has(modelType)) continue;

    const current = result[prop.name] as
      | Record<string, unknown>
      | null
      | undefined;
    const isEmpty =
      !current ||
      current.provider === "empty" ||
      current.provider === "" ||
      current.id === "";

    const userDefault =
      defaults[defaultKeyFor(modelType, nodeType)] ?? defaults[modelType];
    if (
      isEmpty &&
      userDefault &&
      supportsNodeTask(userDefault, modelType, nodeType)
    ) {
      result[prop.name] = {
        type: modelType,
        provider: userDefault.provider,
        id: userDefault.id,
        name: userDefault.name
      };
    }
  }

  return result;
}
