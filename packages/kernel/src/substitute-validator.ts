/**
 * Runtime value validation for a `substitute` verdict.
 *
 * Not a `TypeMetadata` compatibility check: `graph.validate()` compares
 * *declared* edge types and the runtime accepts any object for custom types, so
 * a type-compatibility pass would wave through a fabricated `{type:"image"}`
 * blob with a uri pointing nowhere. This checks the actual value against the
 * node's declared output type — primitives and enums strictly, lists and
 * objects structurally, and reference types as well-formed refs whose uri
 * *resolves* against the run's storage.
 *
 * Resolution is asynchronous, which is why acceptance is an async hook on the
 * supervisor's verdict tool rather than a check after `decide()` returns: by
 * then the conversation is over and there is nobody left to bounce an error to.
 *
 * See docs/workflow-supervisor-design.md §5.2.
 */

/** Declared output types that carry a uri/asset id needing resolution. */
const REFERENCE_TYPES = new Set([
  "image",
  "audio",
  "video",
  "document",
  "asset",
  "file",
  "model",
  "folder"
]);

export interface SubstituteValidationResult {
  ok: boolean;
  /** One line per rejected slot, ready to hand back as a tool error. */
  issues: string[];
}

export interface SubstituteValidatorOptions {
  /** Declared output types, keyed by slot (`NodeDescriptor.outputs`). */
  declaredOutputs: Record<string, string>;
  /**
   * Resolves a reference's uri against run storage. Returning false rejects
   * the substitution. Omitted ⇒ references are rejected outright, because an
   * unresolvable ref is exactly the failure this check exists to catch.
   */
  resolveRef?: (uri: string) => Promise<boolean>;
}

export async function validateSubstituteOutputs(
  outputs: Record<string, unknown>,
  opts: SubstituteValidatorOptions
): Promise<SubstituteValidationResult> {
  const issues: string[] = [];
  const declared = opts.declaredOutputs;

  // A substitution must fill every declared slot. An omitted slot emits no
  // value *and* no `lineage_done`, so a downstream join correlated on that
  // slot keeps waiting for a key that will never arrive — the same hole
  // `skip` needed explicit signalling to close (design §5.2). Node code may
  // legitimately emit a subset (an `If` emits one branch); a model-authored
  // repair does not get that latitude.
  for (const slot of Object.keys(declared)) {
    if (outputs[slot] === undefined) {
      issues.push(`output "${slot}" is declared by this node but missing`);
    }
  }

  for (const [slot, value] of Object.entries(outputs)) {
    const type = declared[slot];
    if (type === undefined) {
      issues.push(`output "${slot}" is not declared by this node`);
      continue;
    }
    const issue = await validateOne(slot, value, type, opts);
    if (issue) issues.push(issue);
  }

  return { ok: issues.length === 0, issues };
}

/**
 * True when every declared output has a rule this validator can enforce.
 * `substitute` is offered only for full coverage — a partially-checked
 * substitution is an unchecked one for the slot that matters.
 *
 * `any` is not coverage: a rule that accepts everything checks nothing, so an
 * all-`any` node would offer a repair no validator could reject. It is treated
 * like a reference type the run cannot resolve — no substitute.
 */
export function hasFullValidatorCoverage(
  declaredOutputs: Record<string, string>,
  canResolveRefs: boolean
): boolean {
  const types = Object.values(declaredOutputs);
  if (types.length === 0) return false;
  return types.every((type) => {
    const base = baseType(type);
    if (REFERENCE_TYPES.has(base)) return canResolveRefs;
    return (
      base === "str" ||
      base === "string" ||
      base === "int" ||
      base === "integer" ||
      base === "float" ||
      base === "number" ||
      base === "bool" ||
      base === "boolean" ||
      base === "list" ||
      base === "array" ||
      base === "dict" ||
      base === "object"
    );
  });
}

function baseType(type: string): string {
  // `list[str]` / `dict[str, any]` → `list` / `dict`
  const bracket = type.indexOf("[");
  return (bracket === -1 ? type : type.slice(0, bracket)).trim().toLowerCase();
}

async function validateOne(
  slot: string,
  value: unknown,
  type: string,
  opts: SubstituteValidatorOptions
): Promise<string | null> {
  const base = baseType(type);

  switch (base) {
    case "str":
    case "string":
      return typeof value === "string"
        ? null
        : `output "${slot}" must be a string, got ${describe(value)}`;
    case "int":
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? null
        : `output "${slot}" must be an integer, got ${describe(value)}`;
    case "float":
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `output "${slot}" must be a finite number, got ${describe(value)}`;
    case "bool":
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `output "${slot}" must be a boolean, got ${describe(value)}`;
    case "list":
    case "array":
      return Array.isArray(value)
        ? null
        : `output "${slot}" must be a list, got ${describe(value)}`;
    case "dict":
    case "object":
      return isPlainObject(value)
        ? null
        : `output "${slot}" must be an object, got ${describe(value)}`;
    default:
      break;
  }

  if (REFERENCE_TYPES.has(base)) {
    if (!isPlainObject(value)) {
      return `output "${slot}" must be a ${base} reference, got ${describe(value)}`;
    }
    const ref = value;
    if (ref.type !== base) {
      return `output "${slot}" must carry type "${base}", got ${describe(ref.type)}`;
    }
    const uri = typeof ref.uri === "string" ? ref.uri : "";
    const assetId = typeof ref.asset_id === "string" ? ref.asset_id : "";
    if (!uri && !assetId) {
      return `output "${slot}" is a ${base} reference with neither uri nor asset_id`;
    }
    if (!opts.resolveRef) {
      return `output "${slot}" is a ${base} reference and this run cannot resolve references`;
    }
    const resolved = await opts.resolveRef(uri || assetId);
    return resolved
      ? null
      : `output "${slot}" references ${JSON.stringify(uri || assetId)}, which does not resolve`;
  }

  // An unrecognized declared type has no rule, and an unchecked slot is what
  // this validator exists to prevent.
  return `output "${slot}" has type "${type}", which has no runtime validation rule`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "a list";
  return typeof value;
}
