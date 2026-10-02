import type { Mutable } from "./mutable.js";
import { isBoolean, isRecord, isString } from "./predicates.js";

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
    if (!isRecord(item) || !isString(item.value) || !item.value || seen.has(item.value)) return [];
    const option: Mutable<ChoiceCardOption> = { value: item.value };
    for (const key of ["title", "description", "image"] as const) {
      if (item[key] === undefined) { continue; }
      if (!isString(item[key])) { return []; }
      option[key] = item[key];
    }
    if (item.disabled !== undefined) {
      if (!isBoolean(item.disabled)) { return []; }
      option.disabled = item.disabled;
    }
    seen.add(item.value);
    options.push(option);
  }
  return options;
}
