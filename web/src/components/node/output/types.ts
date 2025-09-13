export const typeFor = (value: any): string => {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object" && "type" in value)
    return (value as any).type as string;
  return typeof value;
};
