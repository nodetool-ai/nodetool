export const serializeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

