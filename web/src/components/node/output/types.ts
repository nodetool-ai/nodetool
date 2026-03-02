/**
 * Get the type string for a value.
 * Handles typed output values from nodes (e.g., {type: "image", uri: "..."}).
 */
export const typeFor = (value: unknown): string => {
  if (value === undefined || value === null) {return "null";}
  if (Array.isArray(value)) {return "array";}
  if (typeof value === "boolean") {return "boolean";}
  if (typeof value === "object" && value !== null && "type" in value) {
    return (value as { type: string }).type;
  }
  return typeof value;
};
