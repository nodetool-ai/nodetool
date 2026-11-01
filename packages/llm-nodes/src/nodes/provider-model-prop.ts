import { prop } from "@nodetool-ai/node-sdk";

/** A model field's value: a picked model, or a bare id from an older enum field. */
export type ModelFieldValue = string | { id?: string | null } | null | undefined;

/** The model id a field holds, or an empty string when none is picked. */
export function modelIdOf(value: ModelFieldValue): string {
  if (typeof value === "string") return value;
  return value?.id ?? "";
}

/**
 * A model field for a node that runs on one provider. The picker lists that
 * provider's live models (its own model listing), so ids are never hardcoded
 * in the node. `allowed_providers` locks the picker, including the media
 * pickers, which do not infer a lock from the default.
 */
export function providerModelProp(
  type: string,
  provider: string,
  id: string,
  description: string
): PropertyDecorator {
  return prop({
    type,
    default: { type, provider, id, name: id },
    title: "Model",
    description,
    json_schema_extra: { allowed_providers: [provider] }
  });
}
