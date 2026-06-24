/**
 * Shared helpers for extracting a displayable / copyable value out of a node's
 * raw result. PreviewNode, OutputNode and the chain editor's node card all read
 * the same `output_update`-shaped results, so the unwrapping logic lives here to
 * keep their behavior identical (previously each component carried its own copy,
 * and the chain card's diverged — it dropped array and `.value` handling).
 */

/**
 * Unwrap the user-facing output from a raw result.
 *
 * Results arrive either as a bare value, as a `{ output }` wrapper, or as an
 * array of either. Arrays are mapped element-wise; an all-string array is joined
 * with newlines so streamed text renders as one block.
 */
export const getOutputFromResult = (result: unknown): unknown => {
  if (result === null || result === undefined) {
    return null;
  }

  if (Array.isArray(result)) {
    const outputs = result.map((item: unknown) => {
      if (
        item &&
        typeof item === "object" &&
        "output" in item &&
        item.output !== undefined
      ) {
        return item.output;
      }
      return item;
    });

    if (
      outputs.every((output): output is string => typeof output === "string")
    ) {
      return outputs.join("\n");
    }
    return outputs;
  }

  if (
    typeof result === "object" &&
    "output" in result &&
    result.output !== undefined
  ) {
    return result.output;
  }

  return result;
};

/**
 * Resolve the payload to put on the clipboard. Recurses through `{ output }` and
 * `{ value }` wrappers and extracts the string out of `{ type: "text", data }`
 * chunks so copy yields plain text rather than a serialized object.
 */
export const getCopySource = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const flattened = value.map((item) => getCopySource(item));
    if (
      flattened.every((entry): entry is string => typeof entry === "string")
    ) {
      return flattened.join("\n");
    }
    return flattened;
  }

  if (
    typeof value === "object" &&
    "type" in value &&
    value.type === "text" &&
    "data" in value &&
    typeof value.data === "string"
  ) {
    return value.data;
  }

  if (
    typeof value === "object" &&
    "output" in value &&
    value.output !== undefined
  ) {
    return getCopySource(value.output);
  }

  if (
    typeof value === "object" &&
    "value" in value &&
    value.value !== undefined
  ) {
    return getCopySource(value.value);
  }

  return value;
};
