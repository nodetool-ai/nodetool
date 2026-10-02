import { isRecord } from "./predicates.js";

export interface ChoiceCardOption {
  readonly value: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly disabled?: boolean;
}

/** Bound operation output uses the same option shape as authored choices. */
export function parseChoiceCardOptions(value: unknown): readonly ChoiceCardOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: ChoiceCardOption[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.value !== "string" || !item.value || seen.has(item.value)) return [];
    for (const key of ["title", "description", "image"]) {
      if (item[key] !== undefined && typeof item[key] !== "string") return [];
    }
    if (item.disabled !== undefined && typeof item.disabled !== "boolean") return [];
    seen.add(item.value);
    options.push({
      value: item.value,
      ...(typeof item.title === "string" ? { title: item.title } : {}),
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.image === "string" ? { image: item.image } : {}),
      ...(typeof item.disabled === "boolean" ? { disabled: item.disabled } : {})
    });
  }
  return options;
}
