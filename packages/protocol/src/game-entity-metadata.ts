import { z } from "zod";
import { isObjectLike } from "./predicates.js";

export const gameEntityTags = z.array(z.string().min(1).max(128)).max(64).refine(
  (tags) => new Set(tags).size === tags.length,
  "Entity tags must be unique"
);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function validateRawEntityJson(value: unknown, context: z.core.$RefinementCtx, depth: number): boolean {
  const pending: { value: unknown; depth: number; path: (string | number)[] }[] = [{ value, depth, path: [] }];
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) { break; }
    if (item.depth > 16) {
      context.addIssue({ code: "custom", path: item.path, message: "Entity properties exceed JSON depth 16" });
      return false;
    }
    if (!isObjectLike(item.value)) { continue; }
    if (Array.isArray(item.value)) {
      item.value.forEach((child, index) => pending.push({ value: child, depth: item.depth + 1, path: [...item.path, index] }));
      continue;
    }
    for (const [key, child] of Object.entries(item.value)) {
      if (FORBIDDEN_KEYS.has(key) || key.length === 0 || key.length > 128) {
        context.addIssue({ code: "custom", path: [...item.path, key], message: "Invalid entity property key" });
        return false;
      }
      pending.push({ value: child, depth: item.depth + 1, path: [...item.path, key] });
    }
  }
  return true;
}

export const gameEntityPropertyValue = z.preprocess((value, context) => validateRawEntityJson(value, context, 1) ? value : z.NEVER, z.json()).nonoptional();

export const gameEntityProps = z.preprocess((value, context) => validateRawEntityJson(value, context, 0) ? value : z.NEVER, z.record(z.string().min(1).max(128), z.json()).superRefine((props, context) => {
  if (Object.keys(props).length > 64) {
    context.addIssue({ code: "custom", message: "Entity properties exceed 64 keys" });
  }
  if (new TextEncoder().encode(JSON.stringify(props)).byteLength > 65536) {
    context.addIssue({ code: "custom", message: "Entity properties exceed 64 KiB" });
  }
}));

export type GameEntityTags = z.infer<typeof gameEntityTags>;
export type GameEntityProps = z.infer<typeof gameEntityProps>;
