/**
 * Host-side JSON-schema validation for structured step results.
 *
 * A step declares an `outputSchema`; the model answers through `finish_step`.
 * The provider-side tool schema is a hint at best — several backends drop
 * `enum`, flatten unions, or ignore `additionalProperties` — so whether the
 * answer really matches the contract has to be decided here. A verdict schema
 * makes that concrete: "one of five actions, and `substitute` also carries
 * outputs" is a discriminated union, and a validator that only checks the
 * top-level type and required keys accepts a verdict the kernel will reject.
 *
 * Deliberately a subset of JSON Schema — the keywords a step contract uses,
 * validated exactly, rather than the full specification validated loosely.
 */

export interface SchemaViolation {
  /** JSON-path-ish location, e.g. `result.outputs.text`. */
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

const TYPE_NAMES = [
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null"
] as const;

type TypeName = (typeof TYPE_NAMES)[number];

function typeOf(value: unknown): TypeName {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function matchesType(value: unknown, expected: TypeName): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  if (aKeys.length !== Object.keys(bo).length) return false;
  return aKeys.every(
    (key) => Object.hasOwn(bo, key) && deepEqual(ao[key], bo[key])
  );
}

function describe(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text !== undefined && text.length > 60
    ? `${text.slice(0, 60)}…`
    : String(text);
}

/**
 * Validate `value` against `schema`. Returns every violation found, so one
 * bounce back to the model can fix everything rather than one thing per round.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: Schema,
  path = "result"
): SchemaViolation[] {
  const out: SchemaViolation[] = [];
  validate(value, schema, path, out);
  return out;
}

function validate(
  value: unknown,
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  if (schema["const"] !== undefined && !deepEqual(value, schema["const"])) {
    out.push({
      path,
      message: `must equal ${describe(schema["const"])}, got ${describe(value)}`
    });
    return;
  }

  const enumValues = schema["enum"];
  if (Array.isArray(enumValues)) {
    if (!enumValues.some((candidate) => deepEqual(value, candidate))) {
      out.push({
        path,
        message: `must be one of ${enumValues.map((v) => describe(v)).join(", ")}, got ${describe(value)}`
      });
      return;
    }
  }

  const declared = schema["type"];
  const types: TypeName[] = Array.isArray(declared)
    ? (declared.filter((t): t is TypeName =>
        (TYPE_NAMES as readonly string[]).includes(t as string)
      ))
    : typeof declared === "string" &&
        (TYPE_NAMES as readonly string[]).includes(declared)
      ? [declared as TypeName]
      : [];
  if (types.length > 0 && !types.some((t) => matchesType(value, t))) {
    out.push({
      path,
      message: `expected ${types.join(" | ")}, got ${typeOf(value)}`
    });
    return;
  }

  if (typeOf(value) === "object") {
    validateObject(value as Record<string, unknown>, schema, path, out);
  }
  if (Array.isArray(value)) validateArray(value, schema, path, out);
  if (typeof value === "number") validateNumber(value, schema, path, out);
  if (typeof value === "string") validateString(value, schema, path, out);

  validateCombinators(value, schema, path, out);
}

function validateObject(
  value: Record<string, unknown>,
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  const required = schema["required"];
  if (Array.isArray(required)) {
    for (const key of required) {
      // Object.hasOwn, not `in`: a required key named `toString` must be
      // produced by the model, not inherited from the prototype chain.
      if (typeof key === "string" && !Object.hasOwn(value, key)) {
        out.push({ path, message: `missing required property "${key}"` });
      }
    }
  }

  const properties = (schema["properties"] as Schema | undefined) ?? {};
  for (const [key, sub] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key)) continue;
    if (sub && typeof sub === "object") {
      validate(value[key], sub as Schema, `${path}.${key}`, out);
    }
  }

  const additional = schema["additionalProperties"];
  if (additional === false) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) {
        out.push({ path, message: `unexpected property "${key}"` });
      }
    }
  } else if (additional && typeof additional === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) continue;
      validate(entry, additional as Schema, `${path}.${key}`, out);
    }
  }
}

function validateArray(
  value: unknown[],
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  const items = schema["items"];
  if (items && typeof items === "object" && !Array.isArray(items)) {
    value.forEach((entry, index) =>
      validate(entry, items as Schema, `${path}[${index}]`, out)
    );
  }
  const min = schema["minItems"];
  if (typeof min === "number" && value.length < min) {
    out.push({ path, message: `expected at least ${min} items` });
  }
  const max = schema["maxItems"];
  if (typeof max === "number" && value.length > max) {
    out.push({ path, message: `expected at most ${max} items` });
  }
}

function validateNumber(
  value: number,
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  const min = schema["minimum"];
  if (typeof min === "number" && value < min) {
    out.push({ path, message: `must be >= ${min}` });
  }
  const max = schema["maximum"];
  if (typeof max === "number" && value > max) {
    out.push({ path, message: `must be <= ${max}` });
  }
}

function validateString(
  value: string,
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  const min = schema["minLength"];
  if (typeof min === "number" && value.length < min) {
    out.push({ path, message: `must be at least ${min} characters` });
  }
  const max = schema["maxLength"];
  if (typeof max === "number" && value.length > max) {
    out.push({ path, message: `must be at most ${max} characters` });
  }
}

function validateCombinators(
  value: unknown,
  schema: Schema,
  path: string,
  out: SchemaViolation[]
): void {
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    for (const sub of allOf) {
      if (sub && typeof sub === "object") {
        validate(value, sub as Schema, path, out);
      }
    }
  }

  for (const keyword of ["anyOf", "oneOf"] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    // A branch that validates cleanly is the branch the model meant. Reporting
    // every branch's failures would bury the real error under four irrelevant
    // ones, so an all-fail reports the closest branch — fewest violations.
    let closest: SchemaViolation[] | null = null;
    for (const branch of branches) {
      if (!branch || typeof branch !== "object") continue;
      const errors = validateAgainstSchema(value, branch as Schema, path);
      if (errors.length === 0) {
        closest = null;
        break;
      }
      if (closest === null || errors.length < closest.length) closest = errors;
    }
    if (closest) out.push(...closest);
  }
}

/** One-line rendering of violations, for a tool-result bounce. */
export function formatViolations(violations: SchemaViolation[]): string {
  return violations.map((v) => `${v.path}: ${v.message}`).join("; ");
}
