/**
 * TypeMetadata — T-META-1.
 *
 * Parses and represents NodeTool type strings like "list[int]", "union[str, int]",
 * "ImageRef", "any". Supports type compatibility checking.
 */

const NUMERIC_TYPES = new Set(["int", "float", "number"]);

export class TypeMetadata {
  /** The base type name (e.g. "list", "union", "int", "ImageRef"). */
  readonly type: string;
  /** Inner type arguments for parameterized types (e.g. ["int"] for list[int]). */
  readonly args: TypeMetadata[];

  private constructor(type: string, args: TypeMetadata[] = []) {
    this.type = type;
    this.args = args;
  }

  /**
   * Parse a type string into a TypeMetadata instance.
   *
   * Examples: "int", "list[int]", "union[str, int]", "ImageRef", "any"
   */
  static fromString(typeStr: string): TypeMetadata {
    const s = typeStr.trim();
    if (!s) return new TypeMetadata("any");

    const bracketIdx = s.indexOf("[");
    if (bracketIdx === -1) {
      return new TypeMetadata(s);
    }

    // Must end with ]
    if (!s.endsWith("]")) {
      return new TypeMetadata(s);
    }

    const baseName = s.slice(0, bracketIdx);
    const inner = s.slice(bracketIdx + 1, -1).trim();

    // Parse comma-separated args, respecting nested brackets
    const args = splitTypeArgs(inner).map((arg) =>
      TypeMetadata.fromString(arg)
    );
    return new TypeMetadata(baseName, args);
  }

  /** Returns true if this is a list type (e.g. "list[int]"). */
  isListType(): boolean {
    return this.type === "list";
  }

  /** Returns true if this is a union type (e.g. "union[str, int]"). */
  isUnionType(): boolean {
    return this.type === "union";
  }

  /** Returns true if this is the "any" type. */
  isAny(): boolean {
    return this.type === "any";
  }

  /**
   * Check if this type is compatible with another type.
   *
   * Compatible means:
   * - Same type (including args)
   * - Either is "any"
   * - Numeric widening (int -> float, int -> number, float -> number)
   * - Union contains the other type
   * - List element types are compatible
   */
  isCompatibleWith(other: TypeMetadata): boolean {
    // any matches everything
    if (this.isAny() || other.isAny()) return true;

    // Same base type
    if (this.type === other.type) {
      // For parameterized types, check args
      if (this.args.length === 0 && other.args.length === 0) return true;
      if (this.args.length !== other.args.length) return true; // loose match for different arities
      return this.args.every((arg, i) => arg.isCompatibleWith(other.args[i]));
    }

    // Numeric widening
    if (NUMERIC_TYPES.has(this.type) && NUMERIC_TYPES.has(other.type)) {
      return true;
    }

    // Union: check if other type is in this union, or vice versa
    if (this.isUnionType()) {
      return this.args.some((arg) => arg.isCompatibleWith(other));
    }
    if (other.isUnionType()) {
      return other.args.some((arg) => arg.isCompatibleWith(this));
    }

    return false;
  }

  /** String representation. */
  toString(): string {
    if (this.args.length === 0) return this.type;
    return `${this.type}[${this.args.map((a) => a.toString()).join(", ")}]`;
  }
}

/**
 * Split comma-separated type arguments, respecting nested brackets.
 */
function splitTypeArgs(inner: string): string[] {
  if (!inner) return [];

  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of inner) {
    if (ch === "[") {
      depth++;
      current += ch;
    } else if (ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) args.push(last);
  return args;
}
