/**
 * Derives a node `Property` object from a workflow input so the editor's
 * property components (via getComponentForProperty) can render it in an app.
 * Ported from the mini-app inputs form so appbuilder is self-contained.
 */
import { Property } from "../../stores/ApiTypes";
import { clampNumber, WorkflowInputKind } from "./inputKinds";
import { WorkflowInputIO } from "./workflowIO";

/** Kinds rendered by a dedicated model-select component, not the resolver. */
export const MODEL_INPUT_KINDS: ReadonlySet<WorkflowInputKind> = new Set([
  "language_model",
  "image_model",
  "video_model",
  "tts_model",
  "asr_model",
  "embedding_model"
]);

const KIND_TO_PROPERTY_TYPE: Record<
  WorkflowInputKind,
  Property["type"]["type"]
> = {
  string: "str",
  integer: "int",
  float: "float",
  boolean: "bool",
  color: "color",
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  dataframe: "dataframe",
  file_path: "str",
  folder_path: "str",
  folder: "folder",
  select: "enum",
  language_model: "language_model",
  image_model: "image_model",
  video_model: "video_model",
  tts_model: "tts_model",
  asr_model: "asr_model",
  embedding_model: "embedding_model",
  image_list: "list",
  video_list: "list",
  audio_list: "list",
  text_list: "list"
};

const getTypeArgsForKind = (kind: WorkflowInputKind) => {
  switch (kind) {
    case "image_list":
      return [{ type: "image", optional: false, type_args: [] }];
    case "video_list":
      return [{ type: "video", optional: false, type_args: [] }];
    case "audio_list":
      return [{ type: "audio", optional: false, type_args: [] }];
    case "text_list":
      return [{ type: "str", optional: false, type_args: [] }];
    default:
      return [];
  }
};

const kindFallbackDefault = (input: WorkflowInputIO): unknown => {
  switch (input.kind) {
    case "string":
    case "file_path":
    case "folder_path":
      return "";
    case "boolean":
      return false;
    case "select":
      return input.options?.[0] ?? "";
    case "image_list":
    case "video_list":
    case "audio_list":
    case "text_list":
      return [];
    default:
      return null;
  }
};

/**
 * The value to seed runtime state with before the user touches a control, so a
 * run sends what the form displays: the node's stored value, else the
 * select/boolean fallback the control shows (options[0] / false). Other kinds
 * stay unseeded — omitting the param lets the input node's own default apply.
 */
export const seedInputValue = (input: WorkflowInputIO): unknown => {
  if (input.defaultValue !== undefined) return input.defaultValue;
  if (input.kind === "boolean") return false;
  if (input.kind === "select") return input.options?.[0];
  return undefined;
};

export const createPropertyForInput = (input: WorkflowInputIO): Property => {
  const defaultValue =
    input.defaultValue !== undefined
      ? input.defaultValue
      : kindFallbackDefault(input);

  const enumValues =
    input.kind === "select" && input.options ? input.options : null;

  const property: Property = {
    name: input.name,
    type: {
      type: KIND_TO_PROPERTY_TYPE[input.kind],
      optional: true,
      values: enumValues,
      type_args: getTypeArgsForKind(input.kind),
      type_name: input.kind === "select" ? input.enumTypeName ?? null : null
    },
    default: defaultValue,
    title: input.label,
    description: input.description ?? "",
    min:
      input.kind === "integer" || input.kind === "float"
        ? input.min ?? null
        : null,
    max:
      input.kind === "integer" || input.kind === "float"
        ? input.max ?? null
        : null,
    required: false
  };

  // json_schema_extra routes the base "str" type to the path-picker components.
  if (input.kind === "file_path") {
    property.json_schema_extra = { type: "file_path" };
  }
  if (input.kind === "folder_path") {
    property.json_schema_extra = { type: "folder_path" };
  }

  return property;
};

/** The value a control should display: stored value, else default, else a kind-shaped blank. */
export const resolveInputValue = (
  input: WorkflowInputIO,
  property: Property,
  stored: unknown
): unknown => {
  if (stored !== undefined) return stored;
  if (property.default !== undefined && property.default !== null) {
    return property.default;
  }
  switch (input.kind) {
    case "string":
    case "file_path":
    case "folder_path":
      return "";
    case "boolean":
      return false;
    case "image_list":
    case "video_list":
    case "audio_list":
    case "text_list":
      return [];
    default:
      return undefined;
  }
};

/**
 * Normalizes a control's outgoing value before it lands in runtime state (and
 * so before a run uses it as a param): integers round then clamp, floats
 * clamp, strings truncate to maxLength.
 */
export const normalizeInputValue = (
  input: WorkflowInputIO,
  value: unknown
): unknown => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (input.kind === "integer") {
      return clampNumber(Math.round(value), input.min, input.max);
    }
    if (input.kind === "float") {
      return clampNumber(value, input.min, input.max);
    }
  }
  if (
    input.kind === "string" &&
    typeof value === "string" &&
    typeof input.maxLength === "number" &&
    input.maxLength > 0
  ) {
    return value.slice(0, input.maxLength);
  }
  return value;
};
