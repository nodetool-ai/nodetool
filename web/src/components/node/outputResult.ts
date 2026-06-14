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
        (item as Record<string, unknown>).output !== undefined
      ) {
        return (item as Record<string, unknown>).output;
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
    result !== null &&
    "output" in result &&
    (result as Record<string, unknown>).output !== undefined
  ) {
    return (result as Record<string, unknown>).output;
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
    value !== null &&
    "type" in value &&
    (value as Record<string, unknown>).type === "text" &&
    typeof (value as Record<string, unknown>).data === "string"
  ) {
    return (value as Record<string, unknown>).data;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "output" in value &&
    (value as Record<string, unknown>).output !== undefined
  ) {
    return getCopySource((value as Record<string, unknown>).output);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    (value as Record<string, unknown>).value !== undefined
  ) {
    return getCopySource((value as Record<string, unknown>).value);
  }

  return value;
};
