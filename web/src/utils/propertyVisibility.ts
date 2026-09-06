import type { Property } from "../stores/ApiTypes";
import { isRecord } from "./typePredicates";

export interface PropertyVisibilityRule {
  /** Property whose current value controls this property's visibility. */
  property: string;
  /** Optional dotted path inside the controlling value. */
  path?: string;
  equals?: unknown;
  includes?: unknown;
  includes_any?: unknown[];
}

function readPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function parseRule(value: unknown): PropertyVisibilityRule | null {
  if (!isRecord(value) || typeof value.property !== "string") return null;
  return {
    property: value.property,
    path: typeof value.path === "string" ? value.path : undefined,
    equals: value.equals,
    includes: value.includes,
    includes_any: Array.isArray(value.includes_any)
      ? value.includes_any
      : undefined
  };
}

/**
 * Evaluate a property's optional `json_schema_extra.visible_when` rule.
 * Unknown/malformed rules fail open so metadata upgrades never hide inputs.
 */
export function isPropertyConditionSatisfied(
  property: Property,
  values: Record<string, unknown> | undefined
): boolean {
  const rawRule = property.json_schema_extra?.visible_when;
  if (rawRule === undefined) return true;
  const rule = parseRule(rawRule);
  if (!rule) return true;

  const candidate = readPath(values?.[rule.property], rule.path);
  if (rule.includes_any !== undefined) {
    return (
      Array.isArray(candidate) &&
      rule.includes_any.some((item) => candidate.includes(item))
    );
  }
  if (rule.includes !== undefined) {
    return Array.isArray(candidate) && candidate.includes(rule.includes);
  }
  if (Object.prototype.hasOwnProperty.call(rawRule, "equals")) {
    return Object.is(candidate, rule.equals);
  }
  return Boolean(candidate);
}

/** Keep connected inputs renderable even when a model no longer supports them. */
export function shouldRenderProperty(
  property: Property,
  values: Record<string, unknown> | undefined,
  isConnected: boolean
): boolean {
  return isConnected || isPropertyConditionSatisfied(property, values);
}
