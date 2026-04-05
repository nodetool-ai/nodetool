import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

// ---------------------------------------------------------------------------
// Lua literal encoding helpers
// ---------------------------------------------------------------------------

/**
 * Return a Lua string literal representing `value`.
 *
 * Uses long-bracket quoting (`[===[...]===]`) to minimize escaping.
 * If the input contains the closing `]===]` sequence, falls back to
 * standard quoted string with escaped characters.
 */
export function luaEscapeString(value: string): string {
  if (!value.includes("]===]")) {
    return "[===[" + value + "]===]";
  }
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
  return '"' + escaped + '"';
}

/**
 * Best-effort conversion of a JS value to a Lua literal.
 *
 * Supports null/undefined, boolean, number, string, arrays, and plain objects.
 * Falls back to `luaEscapeString(String(value))` for unknown types.
 * Depth is limited to avoid excessively deep recursion.
 */
export function luaLiteral(value: unknown, depth = 0): string {
  if (depth > 10) return "nil";
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return luaEscapeString(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => luaLiteral(v, depth + 1)).join(", ");
    return "{" + items + "}";
  }
  if (typeof value === "object") {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof k === "string" && isLuaIdentifier(k)) {
        parts.push(`${k} = ${luaLiteral(v, depth + 1)}`);
      } else {
        parts.push(
          `[${luaLiteral(k, depth + 1)}] = ${luaLiteral(v, depth + 1)}`
        );
      }
    }
    return "{" + parts.join(", ") + "}";
  }
  return luaEscapeString(String(value));
}

/**
 * Check whether a string is a valid Lua identifier (roughly matching Python's
 * `str.isidentifier()` semantics for ASCII identifiers).
 */
function isLuaIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

// ---------------------------------------------------------------------------
// LuaRunner
// ---------------------------------------------------------------------------

export interface LuaRunnerOptions extends StreamRunnerOptions {
  image?: string;
  executable?: string;
}

/**
 * Docker-backed (or subprocess) Lua code runner.
 *
 * Builds a sandboxed Lua snippet that:
 * 1. Creates a restricted `_ENV` with only safe builtins.
 * 2. Injects env_locals into that environment.
 * 3. Loads and executes user code within the restricted environment,
 *    with compatibility for both Lua 5.1 (loadstring + setfenv) and
 *    Lua 5.2+ (load with env parameter).
 */
export class LuaRunner extends StreamRunnerBase {
  readonly executable: string;

  constructor(options?: LuaRunnerOptions) {
    super({
      image: options?.image ?? "nickblah/lua:5.2.4-luarocks-ubuntu",
      ...options
    });
    this.executable = options?.executable ?? "lua";
  }

  override buildContainerCommand(
    userCode: string,
    envLocals: Record<string, unknown>
  ): string[] {
    // Build injected locals lines
    const injectedLocalsLines: string[] = [];
    for (const [key, val] of Object.entries(envLocals ?? {})) {
      if (typeof key !== "string" || !isLuaIdentifier(key)) {
        // Skip invalid identifiers
        continue;
      }
      injectedLocalsLines.push(`_ENV[${luaLiteral(key)}] = ${luaLiteral(val)}`);
    }

    // Compose the sandbox prelude and user code executor
    const luaSnippet =
      "do " +
      "local _G = _G; " +
      "local base = {assert=assert, error=error, ipairs=ipairs, next=next, pairs=pairs, pcall=pcall, select=select, tonumber=tonumber, tostring=tostring, type=type, utf8=utf8, math=math, string=string, table=table, print=print}; " +
      "local _ENV = setmetatable({}, { __index = base }); " +
      (injectedLocalsLines.length > 0
        ? injectedLocalsLines.join("; ") + "; "
        : "") +
      "local src = " +
      luaEscapeString(userCode) +
      "; " +
      // Prefer Lua 5.1-compatible loadstring first; fall back to 5.2+ load with env
      "local fn, err = nil, nil; " +
      "if _G.loadstring then fn, err = _G.loadstring(src); if fn and _G.setfenv then _G.setfenv(fn, _ENV) end end; " +
      "if not fn and _G.load then fn, err = _G.load(src, 'user', 't', _ENV) end; " +
      "if not fn then error(err or 'failed to load code') end; " +
      "fn(); " +
      "end";

    return [this.executable, "-e", luaSnippet];
  }
}

// ---------------------------------------------------------------------------
// LuaSubprocessRunner
// ---------------------------------------------------------------------------

/**
 * Convenience runner that always uses local subprocess mode.
 */
export class LuaSubprocessRunner extends LuaRunner {
  constructor(options?: LuaRunnerOptions) {
    super({
      executable: options?.executable ?? "lua",
      mode: "subprocess",
      ...options
    });
  }
}
