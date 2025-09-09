import { TypeMetadata } from "../stores/ApiTypes";

/**
 * Human readable string representation of a type.
 */
export const typeToString = (type: TypeMetadata): string => {
  switch (type.type) {
    case "any":
      return "any";
    case "enum":
      return type.values ? type.values.join(" | ") : "enum";
    case "list":
      return type.type_args && type.type_args.length === 1
        ? `${typeToString(type.type_args[0])}[]`
        : "list";
    case "dict":
      return type.type_args && type.type_args.length === 2
        ? `{ ${typeToString(type.type_args[0])}: ${typeToString(
            type.type_args[1]
          )} }`
        : "dict";
    case "union":
      return type.type_args && type.type_args.length > 0
        ? type.type_args.map((t) => typeToString(t)).join(" | ")
        : "union";
    default:
      return type.type;
  }
};

/**
 * Create a slug from a string. Used for namespaces.
 */
export const Slugify = (input: string): string => {
  return input.replaceAll(".", "_").replaceAll("-", "_").toLowerCase();
};

/**
 * Checks if a type is connectable to a union type. This is the case if the type
 * is connectable to at least one of the type arguments of the union type.
 *
 * @param the_type The type.
 * @param union_type The union type.
 */

// const isConnectableToUnion = (
//   the_type: TypeMetadata,
//   union_type: TypeMetadata
// ): boolean => {
//   if (union_type.type_args) {
//     return union_type.type_args.some((t) => isConnectable(the_type, t));
//   }
//   return false;
// };

/**
 * Checks if two types are equal. This is the case if they have the same type
 * and the same type arguments.
 */
const equalType = (a: TypeMetadata, b: TypeMetadata): boolean => {
  if (a.type !== b.type) {
    return false;
  }
  if ((a.type_args && !b.type_args) || (!a.type_args && b.type_args)) {
    return false;
  }
  if (a.type_args) {
    return a.type_args.every(
      (t, i) => b.type_args && equalType(t, b.type_args[i])
    );
  }
  return true;
};

/**
 * Checks if two enum types are connectable. This is the case if the values of
 * the first enum type are a subset of the values of the second enum type.
 *
 * @param a The first enum type.
 * @param b The second enum type.
 */
const isEnumConnectable = (a: TypeMetadata, b: TypeMetadata): boolean => {
  if (a.values) {
    return (
      new Set(a.values).size === new Set(b.values).size &&
      a.values.every((value) => b.values?.includes(value))
    );
  }
  return false;
};

/**
 * Checks if a JavaScript value matches the given TypeMetadata.
 */
export const valueMatchesType = (
  value: unknown,
  meta: TypeMetadata | undefined
): boolean => {
  if (!meta || !meta.type) {
    return false;
  }

  // Handle optional
  if (value === undefined) {
    return !!meta.optional;
  }

  // Helper to identify plain objects (non-null, non-array)
  const isPlainObject = (v: unknown): v is Record<string, unknown> => {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  };

  const matchesKeyType = (key: string, keyType: TypeMetadata): boolean => {
    switch (keyType.type) {
      case "any":
      case "str":
        return true;
      case "number": {
        const n = Number(key);
        return Number.isFinite(n);
      }
      case "boolean":
        return key === "true" || key === "false";
      case "enum":
        return keyType.values ? keyType.values.includes(key) : true;
      case "union":
        return keyType.type_args?.some((t) => matchesKeyType(key, t)) ?? false;
      default:
        // Keys are strings in JS; for other key types, accept as best-effort
        return true;
    }
  };

  const matches = (v: unknown, t: TypeMetadata): boolean => {
    switch (t.type) {
      case "any":
        return true;
      case "null":
        return v === null;
      case "str":
        return typeof v === "string";
      case "number":
        return typeof v === "number" && Number.isFinite(v);
      case "boolean":
        return typeof v === "boolean";
      case "enum":
        if (!t.values || t.values.length === 0) {
          return typeof v === "string";
        }
        return typeof v === "string" && t.values.includes(v);
      case "list": {
        if (!Array.isArray(v)) return false;
        const elementType = t.type_args && t.type_args[0];
        if (!elementType) return true; // untyped list
        return v.every((item) => matches(item, elementType));
      }
      case "tuple": {
        if (!Array.isArray(v)) return false;
        const argCount = t.type_args?.length ?? 0;
        if (argCount === 0) return true; // treat as any[]
        if (v.length !== argCount) return false;
        for (let i = 0; i < argCount; i++) {
          const argType = t.type_args![i];
          if (!matches(v[i], argType)) return false;
        }
        return true;
      }
      case "dict": {
        // Support both plain objects and Map-like values
        const keyType = t.type_args && t.type_args[0];
        const valueType = t.type_args && t.type_args[1];

        if (v instanceof Map) {
          for (const [k, val] of v.entries()) {
            const keyStr = String(k);
            if (keyType && !matchesKeyType(keyStr, keyType)) return false;
            if (valueType && !matches(val, valueType)) return false;
          }
          return true;
        }

        if (!isPlainObject(v)) return false;
        for (const [k, val] of Object.entries(v)) {
          if (keyType && !matchesKeyType(k, keyType)) return false;
          if (valueType && !matches(val, valueType)) return false;
        }
        return true;
      }
      case "union": {
        if (!t.type_args || t.type_args.length === 0) return false;
        return t.type_args.some((opt) => matches(v, opt));
      }
      case "object":
        return isPlainObject(v);
      default:
        // Treat all other named types as object-like references
        return isPlainObject(v);
    }
  };

  return matches(value, meta);
};

const nonObjectTypes = [
  "str",
  "number",
  "boolean",
  "null",
  "enum",
  "list",
  "dict",
  "union",
  "tuple"
];

export const isConnectable = (
  source: TypeMetadata,
  target: TypeMetadata,
  allowAny: boolean = true
): boolean => {
  // Safety check for undefined types
  if (!source || !target || !source.type || !target.type) {
    return false;
  }

  if (allowAny && (source.type === "any" || target.type === "any")) {
    return true;
  }

  if (source.type === "union") {
    // this is not 100% safe but we want to be able to connect
    // if the union is a subset of the target
    return source.type_args.length > 0
      ? source.type_args.some((t) => isConnectable(t, target))
      : false;
  }

  if (target.type === "union") {
    return target.type_args.length > 0
      ? target.type_args.some((t) => isConnectable(source, t))
      : false;
  }

  if (target.type === "object") {
    if (source.type === "union" && source.type_args.length > 0) {
      // For unions, some types in the union must be compatible with object
      return source.type_args.some((t) => !nonObjectTypes.includes(t.type));
    }
    return !nonObjectTypes.includes(source.type);
  }

  if (target.type === "enum") {
    return source.type === "str";
  }

  switch (source.type) {
    case "union":
    case "enum":
      if (target.type === "str") {
        return true;
      }
      return target.type === "enum" && isEnumConnectable(source, target);
    case "list":
      if (target.type === "list") {
        if (source.type_args.length === 0 || target.type_args.length === 0) {
          return true;
        }
        if (
          source.type_args.length === 1 &&
          target.type_args.length === 1 &&
          source.type_args[0] !== undefined &&
          target.type_args[0] !== undefined
        ) {
          return isConnectable(source.type_args[0], target.type_args[0]);
        } else {
          return true;
        }
      } else {
        return false;
      }
    case "dict":
      if (target.type === "dict") {
        if (source.type_args.length < 2 || target.type_args.length < 2) {
          return true;
        }
        if (source.type_args.length === 2 && target.type_args.length === 2) {
          return (
            isConnectable(source.type_args[0], target.type_args[0]) &&
            isConnectable(source.type_args[1], target.type_args[1])
          );
        }
      } else {
        return false;
      }
      break;
    default:
      return source.type === target.type;
  }
  return false;
};
