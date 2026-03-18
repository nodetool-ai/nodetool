/**
 * Type validation — T-META-3.
 *
 * Validates a runtime value against a NodeTool type string.
 */

import { TypeMetadata } from "./type-metadata.js";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID: ValidationResult = { valid: true };

function fail(message: string): ValidationResult {
  return { valid: false, error: message };
}

/**
 * Validate that `value` conforms to the type described by `typeStr`.
 *
 * Supported types: int, float, number, str, string, bool, boolean,
 * list[X], any. Unknown types pass validation (no schema to check against).
 */
export function validateType(value: unknown, typeStr: string): ValidationResult {
  const meta = TypeMetadata.fromString(typeStr);
  return validateWithMeta(value, meta);
}

function validateWithMeta(value: unknown, meta: TypeMetadata): ValidationResult {
  if (meta.isAny()) return VALID;

  const { type } = meta;

  if (type === "int") {
    if (typeof value !== "number") return fail(`Expected int, got ${typeof value}`);
    if (!Number.isInteger(value)) return fail(`Expected integer, got float ${value}`);
    return VALID;
  }

  if (type === "float" || type === "number") {
    if (typeof value !== "number") return fail(`Expected ${type}, got ${typeof value}`);
    return VALID;
  }

  if (type === "str" || type === "string") {
    if (typeof value !== "string") return fail(`Expected string, got ${typeof value}`);
    return VALID;
  }

  if (type === "bool" || type === "boolean") {
    if (typeof value !== "boolean") return fail(`Expected boolean, got ${typeof value}`);
    return VALID;
  }

  if (meta.isListType()) {
    if (!Array.isArray(value)) return fail(`Expected array, got ${typeof value}`);
    if (meta.args.length > 0) {
      const elementType = meta.args[0];
      for (let i = 0; i < value.length; i++) {
        const r = validateWithMeta(value[i], elementType);
        if (!r.valid) return fail(`Element [${i}]: ${r.error}`);
      }
    }
    return VALID;
  }

  // Unknown/custom types (ImageRef, AudioRef, etc.) — no validation possible
  return VALID;
}
