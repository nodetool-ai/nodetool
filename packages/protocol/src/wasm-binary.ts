/**
 * A minimal WebAssembly binary reader — enough of the format to decide the
 * sandbox's scalar call contract, and nothing more.
 *
 * It lives in `protocol` because two packages have to read the same bytes the
 * same way: `node-sdk` validates a pack's binary at discovery time, and
 * `agents` needs each export's signature at call time to validate arguments
 * host-side. A second parser would be a second answer.
 *
 * Pure and browser-safe: no Node built-ins, no `WebAssembly` compilation.
 */

/** WebAssembly numeric value types the scalar contract allows. */
export const WASM_VALUE_TYPE = {
  I32: 0x7f,
  I64: 0x7e,
  F32: 0x7d,
  F64: 0x7c,
  V128: 0x7b,
  FUNCREF: 0x70,
  EXTERNREF: 0x6f
} as const;

/** The kinds an export entry can carry, in the binary's own order. */
export const WASM_EXPORT_KIND = {
  FUNCTION: 0,
  TABLE: 1,
  MEMORY: 2,
  GLOBAL: 3
} as const;

export interface WasmSignature {
  readonly parameters: readonly number[];
  readonly results: readonly number[];
}

export interface WasmExportEntry {
  readonly kind: number;
  readonly index: number;
}

export interface WasmMemoryLimits {
  readonly minimum: number;
  readonly maximum?: number;
  readonly shared: boolean;
}

export interface ParsedWasmBinary {
  readonly importCount: number;
  readonly memories: readonly WasmMemoryLimits[];
  readonly exports: ReadonlyMap<string, WasmExportEntry>;
  /** Signature per function index, imports excluded (the contract forbids them). */
  readonly functions: readonly WasmSignature[];
}

/** Raised when a binary is truncated, malformed, or not WebAssembly at all. */
export class WasmBinaryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WasmBinaryError";
  }
}

/** Human name for a value type, for use in a skip reason. */
export function wasmValueTypeName(type: number): string {
  switch (type) {
    case WASM_VALUE_TYPE.I32:
      return "i32";
    case WASM_VALUE_TYPE.I64:
      return "i64";
    case WASM_VALUE_TYPE.F32:
      return "f32";
    case WASM_VALUE_TYPE.F64:
      return "f64";
    case WASM_VALUE_TYPE.V128:
      return "v128";
    case WASM_VALUE_TYPE.FUNCREF:
      return "funcref";
    case WASM_VALUE_TYPE.EXTERNREF:
      return "externref";
    default:
      return `value type 0x${type.toString(16)}`;
  }
}

/** Human name for an export kind, for use in a skip reason. */
export function wasmExportKindName(kind: number): string {
  switch (kind) {
    case WASM_EXPORT_KIND.FUNCTION:
      return "function";
    case WASM_EXPORT_KIND.TABLE:
      return "table";
    case WASM_EXPORT_KIND.MEMORY:
      return "memory";
    case WASM_EXPORT_KIND.GLOBAL:
      return "global";
    default:
      return `export kind ${kind}`;
  }
}

class BinaryCursor {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get done(): boolean {
    return this.offset === this.bytes.length;
  }
  readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new WasmBinaryError("truncated WASM binary");
    }
    const byte = this.bytes[this.offset];
    this.offset += 1;
    return byte as number;
  }
  readBytes(count: number): number[] {
    return Array.from({ length: count }, () => this.readByte());
  }
  u32(): number {
    let value = 0;
    let shift = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = this.readByte();
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        if (value > 0xffffffff)
          throw new WasmBinaryError("invalid WASM integer");
        return value;
      }
      shift += 7;
    }
    throw new WasmBinaryError("invalid WASM integer");
  }
  vectorLength(): number {
    return this.u32();
  }
  string(): string {
    const bytes = this.readBytes(this.u32());
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(bytes)
      );
    } catch (error) {
      throw new WasmBinaryError("invalid WASM name", { cause: error });
    }
  }
  valueTypes(): number[] {
    return Array.from({ length: this.vectorLength() }, () => this.readByte());
  }
  skipRemaining(): void {
    this.offset = this.bytes.length;
  }
  section() {
    const id = this.readByte();
    const size = this.u32();
    if (this.offset + size > this.bytes.length) {
      throw new WasmBinaryError("truncated WASM section");
    }
    const payload = this.bytes.slice(this.offset, this.offset + size);
    this.offset += size;
    return { id, payload };
  }
}

/** Read the sections the scalar contract needs. Throws {@link WasmBinaryError}. */
export function parseWasmBinary(bytes: Uint8Array): ParsedWasmBinary {
  const cursor = new BinaryCursor(bytes);
  if (
    cursor.readBytes(4).join(",") !== "0,97,115,109" ||
    cursor.readBytes(4).join(",") !== "1,0,0,0"
  ) {
    throw new WasmBinaryError("invalid WASM magic or version");
  }
  const types: WasmSignature[] = [];
  const functionTypeIndexes: number[] = [];
  const memories: WasmMemoryLimits[] = [];
  const exports = new Map<string, WasmExportEntry>();
  let importCount = 0;
  while (!cursor.done) {
    const section = cursor.section();
    const sectionCursor = new BinaryCursor(section.payload);
    if (section.id === 1) {
      for (
        let index = 0, count = sectionCursor.vectorLength();
        index < count;
        index += 1
      ) {
        if (sectionCursor.readByte() !== 0x60) {
          throw new WasmBinaryError("invalid WASM function type");
        }
        const parameters = sectionCursor.valueTypes();
        const results = sectionCursor.valueTypes();
        types.push({ parameters, results });
      }
    } else if (section.id === 2) {
      importCount = sectionCursor.vectorLength();
      sectionCursor.skipRemaining();
    } else if (section.id === 3) {
      for (
        let index = 0, count = sectionCursor.vectorLength();
        index < count;
        index += 1
      ) {
        functionTypeIndexes.push(sectionCursor.u32());
      }
    } else if (section.id === 5) {
      for (
        let index = 0, count = sectionCursor.vectorLength();
        index < count;
        index += 1
      ) {
        const flags = sectionCursor.u32();
        const minimum = sectionCursor.u32();
        const hasMaximum = flags === 1 || flags === 3;
        const shared = flags === 2 || flags === 3;
        if (flags !== 0 && flags !== 1 && flags !== 2 && flags !== 3) {
          throw new WasmBinaryError("invalid WASM memory limits");
        }
        type MemoryFields = {
          minimum: number;
          maximum?: number;
          shared: boolean;
        };
        const memory: MemoryFields = {
          minimum,
          shared
        };
        if (hasMaximum) {
          memory.maximum = sectionCursor.u32();
        }
        memories.push(memory);
      }
    } else if (section.id === 7) {
      for (
        let index = 0, count = sectionCursor.vectorLength();
        index < count;
        index += 1
      ) {
        const name = sectionCursor.string();
        const kind = sectionCursor.readByte();
        const entryIndex = sectionCursor.u32();
        if (exports.has(name)) {
          throw new WasmBinaryError(`duplicate WASM export ${name}`);
        }
        exports.set(name, { kind, index: entryIndex });
      }
    } else {
      sectionCursor.skipRemaining();
    }
    if (!sectionCursor.done)
      throw new WasmBinaryError("malformed WASM section");
  }
  const functions = functionTypeIndexes.map((typeIndex) => {
    const signature = types[typeIndex];
    if (signature === undefined) {
      throw new WasmBinaryError("invalid WASM function type index");
    }
    return signature;
  });
  return { importCount, memories, exports, functions };
}
