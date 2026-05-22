/**
 * Shared field-classification helper for node factories.
 *
 * Codegen and runtime factories (replicate, fal, kie) need to derive a
 * node's `inlineFields` / `inputFields` from a flat list of properties.
 * The classification rule is identical across providers:
 *
 *   - Asset-ref types (image, video, audio, image_mask, model_3d, document,
 *     dataframe, tensor, and their list[] variants) -> `inputFields`
 *     (rendered as a handle-only port; wired from upstream).
 *   - Short-text properties (`str`, `text`) whose name matches a small set
 *     of "user types this directly" keys (prompt, query, code, url, ...)
 *     -> `inputFields` as well, so the prompt/text fields are exposed as
 *     handles on the node body. The editor is reached via the Inspector.
 *   - Everything else -> Inspector only.
 *
 * Callers pre-normalize their field shape (lowercasing propType, skipping
 * sub-fields, etc.) and pass the filtered list to `classifyFields`.
 */

const ASSET_PROP_TYPES: ReadonlySet<string> = new Set([
  "image",
  "video",
  "audio",
  "image_mask",
  "model_3d",
  "document",
  "dataframe",
  "tensor",
  "list[image]",
  "list[video]",
  "list[audio]",
  "video_clip_list"
]);

const TEXT_PROP_TYPES: ReadonlySet<string> = new Set(["str", "text"]);

const INLINE_TEXT_FIELD_NAMES: ReadonlySet<string> = new Set([
  "prompt",
  "system_prompt",
  "query",
  "text",
  "template",
  "code",
  "expression",
  "url"
]);

export interface ClassifyFieldInput {
  /** Field/property name */
  name: string;
  /** Normalized prop type — callers should lowercase before passing */
  propType: string;
}

export interface FieldClassification {
  inlineFields: string[];
  inputFields: string[];
}

export function classifyFields(
  fields: ReadonlyArray<ClassifyFieldInput>
): FieldClassification {
  const inlineFields: string[] = [];
  const inputFields: string[] = [];

  for (const field of fields) {
    if (ASSET_PROP_TYPES.has(field.propType)) {
      inputFields.push(field.name);
    } else if (
      TEXT_PROP_TYPES.has(field.propType) &&
      INLINE_TEXT_FIELD_NAMES.has(field.name)
    ) {
      inputFields.push(field.name);
    }
  }

  return { inlineFields, inputFields };
}
