/**
 * Edge-case tests for language runner buildContainerCommand methods.
 *
 * Covers: invalid identifier skipping, special characters, nested structures,
 * and runner-specific repr functions.
 */
import { describe, it, expect } from "vitest";
import { BashDockerRunner } from "../src/bash-runner.js";
import { PythonDockerRunner } from "../src/python-runner.js";
import { JavaScriptDockerRunner } from "../src/javascript-runner.js";
import { RubyDockerRunner } from "../src/ruby-runner.js";
import { CommandDockerRunner } from "../src/command-runner.js";
import { ContainerFailureError } from "../src/stream-runner-base.js";
import {
  LuaRunner,
  LuaSubprocessRunner,
  luaEscapeString,
  luaLiteral
} from "../src/lua-runner.js";

// ============================================================================
// BashDockerRunner – edge cases
// ============================================================================

describe("BashDockerRunner – edge cases", () => {
  const runner = new BashDockerRunner();

  it("skips keys that start with a digit", () => {
    const cmd = runner.buildContainerCommand("echo 1", { "1bad": "val" });
    expect(cmd[2]).not.toContain("1bad");
  });

  it("skips keys with special characters", () => {
    const cmd = runner.buildContainerCommand("echo 1", {
      "invalid-key": 1,
      "also bad!": 2,
      "has space": 3
    });
    expect(cmd[2]).not.toContain("invalid-key");
    expect(cmd[2]).not.toContain("also bad!");
    expect(cmd[2]).not.toContain("has space");
  });

  it("allows underscored keys", () => {
    const cmd = runner.buildContainerCommand("", {
      _private: "ok",
      __dunder: "ok"
    });
    expect(cmd[2]).toContain("_private=");
    expect(cmd[2]).toContain("__dunder=");
  });

  it("handles deeply nested objects", () => {
    const cmd = runner.buildContainerCommand("", {
      deep: { a: { b: { c: 1 } } }
    });
    expect(cmd[2]).toContain('"c": 1');
  });

  it("handles empty string user code", () => {
    const cmd = runner.buildContainerCommand("", {});
    expect(cmd).toEqual(["bash", "-lc", "set -e\n"]);
  });

  it("handles multiline user code", () => {
    const cmd = runner.buildContainerCommand("echo 1\necho 2\necho 3", {});
    expect(cmd[2]).toContain("echo 1\necho 2\necho 3");
  });

  it("handles string with special shell characters", () => {
    const cmd = runner.buildContainerCommand("", {
      msg: 'hello "world" $HOME'
    });
    // JSON.stringify should properly escape the string
    expect(cmd[2]).toContain("msg=");
  });

  it("handles mixed types in array", () => {
    const cmd = runner.buildContainerCommand("", {
      arr: [1, "two", true, null, { x: 1 }]
    });
    expect(cmd[2]).toContain("arr=");
    expect(cmd[2]).toContain("1, ");
  });

  it("handles empty object", () => {
    const cmd = runner.buildContainerCommand("", { obj: {} });
    expect(cmd[2]).toContain("obj={}");
  });

  it("handles empty array", () => {
    const cmd = runner.buildContainerCommand("", { arr: [] });
    expect(cmd[2]).toContain("arr=[]");
  });
});

// ============================================================================
// PythonDockerRunner – edge cases
// ============================================================================

describe("PythonDockerRunner – edge cases", () => {
  const runner = new PythonDockerRunner();

  it("skips keys with hyphens", () => {
    const cmd = runner.buildContainerCommand("pass", { "my-var": 1 });
    expect(cmd[2]).not.toContain("my-var");
  });

  it("skips keys starting with digits", () => {
    const cmd = runner.buildContainerCommand("pass", { "2x": 1 });
    expect(cmd[2]).not.toContain("2x");
  });

  it("handles string with newlines", () => {
    const cmd = runner.buildContainerCommand("", {
      text: "line1\nline2"
    });
    expect(cmd[2]).toContain("text=");
  });

  it("handles nested dict with list values", () => {
    const cmd = runner.buildContainerCommand("", {
      data: { items: [1, 2, 3], name: "test" }
    });
    expect(cmd[2]).toContain('"items": [1, 2, 3]');
    expect(cmd[2]).toContain('"name": "test"');
  });

  it("handles negative numbers", () => {
    const cmd = runner.buildContainerCommand("", { neg: -42 });
    expect(cmd[2]).toContain("neg=-42");
  });

  it("handles float precision", () => {
    const cmd = runner.buildContainerCommand("", { val: 0.1 + 0.2 });
    expect(cmd[2]).toContain("val=0.3");
  });

  it("handles empty string local", () => {
    const cmd = runner.buildContainerCommand("", { s: "" });
    expect(cmd[2]).toContain('s=""');
  });

  it("handles multiple locals in order", () => {
    const cmd = runner.buildContainerCommand("print(a, b)", { a: 1, b: 2 });
    const code = cmd[2];
    expect(code.indexOf("a=1")).toBeLessThan(code.indexOf("b=2"));
    expect(code.indexOf("b=2")).toBeLessThan(code.indexOf("print(a, b)"));
  });
});

// ============================================================================
// JavaScriptDockerRunner – edge cases
// ============================================================================

describe("JavaScriptDockerRunner – edge cases", () => {
  const runner = new JavaScriptDockerRunner();

  it("skips keys with hyphens", () => {
    const cmd = runner.buildContainerCommand("", { "my-var": 1 });
    expect(cmd[2]).not.toContain("my-var");
  });

  it("allows $ in identifiers", () => {
    const cmd = runner.buildContainerCommand("", { $elem: "test" });
    expect(cmd[2]).toContain('const $elem = "test"');
  });

  it("handles undefined as JSON serialized", () => {
    const cmd = runner.buildContainerCommand("", { val: undefined });
    // JSON.stringify(undefined) returns undefined, so it becomes "undefined" in string
    expect(cmd[2]).toContain("const val = ");
  });

  it("handles deeply nested objects", () => {
    const cmd = runner.buildContainerCommand("", {
      config: { db: { host: "localhost", port: 5432 } }
    });
    expect(cmd[2]).toContain("localhost");
    expect(cmd[2]).toContain("5432");
  });

  it("handles boolean and null mix", () => {
    const cmd = runner.buildContainerCommand("", {
      a: true,
      b: false,
      c: null
    });
    expect(cmd[2]).toContain("const a = true;");
    expect(cmd[2]).toContain("const b = false;");
    expect(cmd[2]).toContain("const c = null;");
  });
});

// ============================================================================
// RubyDockerRunner – edge cases
// ============================================================================

describe("RubyDockerRunner – edge cases", () => {
  const runner = new RubyDockerRunner();

  it("skips keys with special chars", () => {
    const cmd = runner.buildContainerCommand("", { "bad-key": 1, ok_key: 2 });
    expect(cmd[2]).not.toContain("bad-key");
    expect(cmd[2]).toContain("ok_key=2");
  });

  it("handles nested hash with array values", () => {
    const cmd = runner.buildContainerCommand("", {
      data: { items: [1, 2], meta: { count: 2 } }
    });
    expect(cmd[2]).toContain("=>");
  });

  it("handles empty hash", () => {
    const cmd = runner.buildContainerCommand("", { obj: {} });
    expect(cmd[2]).toContain("obj={}");
  });

  it("handles empty array", () => {
    const cmd = runner.buildContainerCommand("", { arr: [] });
    expect(cmd[2]).toContain("arr=[]");
  });

  it("handles mixed-type array", () => {
    const cmd = runner.buildContainerCommand("", {
      arr: [1, "two", true, null]
    });
    const code = cmd[2];
    expect(code).toContain("1, ");
    expect(code).toContain('"two"');
    expect(code).toContain("true");
    expect(code).toContain("nil");
  });
});

// ============================================================================
// CommandDockerRunner – edge cases
// ============================================================================

describe("CommandDockerRunner – edge cases", () => {
  const runner = new CommandDockerRunner();

  it("handles multiple consecutive spaces", () => {
    const cmd = runner.buildContainerCommand("echo  hello", {});
    // split(" ") creates empty strings for consecutive spaces
    expect(cmd).toEqual(["echo", "", "hello"]);
  });

  it("handles command with leading space", () => {
    const cmd = runner.buildContainerCommand(" echo hello", {});
    expect(cmd[0]).toBe("");
    expect(cmd[1]).toBe("echo");
  });

  it("handles command with trailing space", () => {
    const cmd = runner.buildContainerCommand("echo hello ", {});
    expect(cmd[cmd.length - 1]).toBe("");
  });
});

// ============================================================================
// LuaRunner – edge cases
// ============================================================================

describe("LuaRunner – edge cases", () => {
  const runner = new LuaRunner();

  it("handles empty envLocals (no injection lines)", () => {
    const cmd = runner.buildContainerCommand("print(1)", {});
    expect(cmd[2]).not.toContain("_ENV[");
  });

  it("handles multiple locals separated by semicolons", () => {
    const cmd = runner.buildContainerCommand("print(1)", { a: 1, b: 2 });
    expect(cmd[2]).toContain("_ENV[[===[a]===]] = 1");
    expect(cmd[2]).toContain("_ENV[[===[b]===]] = 2");
    expect(cmd[2]).toContain("; ");
  });

  it("handles nil values in envLocals", () => {
    const cmd = runner.buildContainerCommand("print(1)", { x: null });
    expect(cmd[2]).toContain("_ENV[[===[x]===]] = nil");
  });

  it("handles array values in envLocals", () => {
    const cmd = runner.buildContainerCommand("", { arr: [1, 2, 3] });
    expect(cmd[2]).toContain("{1, 2, 3}");
  });

  it("handles object values in envLocals", () => {
    const cmd = runner.buildContainerCommand("", { tbl: { x: 1 } });
    expect(cmd[2]).toContain("x = 1");
  });

  it("skips non-string keys gracefully", () => {
    // TypeScript typing doesn't allow this, but runtime might
    const cmd = runner.buildContainerCommand("", { "": 1 });
    // empty string fails identifier check
    expect(cmd[2]).not.toContain("_ENV[");
  });
});

// ============================================================================
// LuaSubprocessRunner – edge cases
// ============================================================================

describe("LuaSubprocessRunner – edge cases", () => {
  it("can override mode option (subprocess is default)", () => {
    const runner = new LuaSubprocessRunner();
    expect(runner.mode).toBe("subprocess");
  });

  it("custom executable propagates to commands", () => {
    const runner = new LuaSubprocessRunner({ executable: "luajit" });
    const cmd = runner.buildContainerCommand("print(1)", {});
    expect(cmd[0]).toBe("luajit");
  });
});

// ============================================================================
// luaEscapeString – additional edge cases
// ============================================================================

describe("luaEscapeString – additional edge cases", () => {
  it("handles string with tabs", () => {
    const s = "col1\tcol2";
    const result = luaEscapeString(s);
    // Normal string without ]===] uses long-bracket syntax
    expect(result).toBe("[===[col1\tcol2]===]");
  });

  it("handles string with backslashes", () => {
    const s = "path\\to\\file";
    const result = luaEscapeString(s);
    expect(result).toBe("[===[path\\to\\file]===]");
  });

  it("fallback escapes tabs and carriage returns", () => {
    const s = "a]===]b\tc\rd";
    const result = luaEscapeString(s);
    expect(result.startsWith('"')).toBe(true);
    expect(result).toContain("\\t");
    expect(result).toContain("\\r");
  });

  it("fallback escapes embedded double quotes", () => {
    const s = 'say]===]"hello"';
    const result = luaEscapeString(s);
    expect(result).toContain('\\"hello\\"');
  });

  it("fallback escapes backslashes", () => {
    const s = "path]===]\\to\\file";
    const result = luaEscapeString(s);
    expect(result).toContain("\\\\to\\\\file");
  });
});

// ============================================================================
// luaLiteral – additional edge cases
// ============================================================================

describe("luaLiteral – additional edge cases", () => {
  it("handles negative numbers", () => {
    expect(luaLiteral(-1)).toBe("-1");
  });

  it("handles NaN", () => {
    expect(luaLiteral(NaN)).toBe("NaN");
  });

  it("handles Infinity", () => {
    expect(luaLiteral(Infinity)).toBe("Infinity");
  });

  it("handles empty object as empty Lua table", () => {
    expect(luaLiteral({})).toBe("{}");
  });

  it("handles empty string", () => {
    expect(luaLiteral("")).toBe("[===[" + "" + "]===]");
  });

  it("handles deeply nested structure at depth boundary", () => {
    // depth 10 is the max, at depth 11 it returns nil
    expect(luaLiteral("ok", 10)).toBe("[===[ok]===]");
    expect(luaLiteral("ok", 11)).toBe("nil");
  });

  it("handles object with mixed identifier and non-identifier keys", () => {
    const result = luaLiteral({ valid: 1, "not-valid": 2 });
    expect(result).toContain("valid = 1");
    expect(result).toContain("[[===[not-valid]===]]");
  });

  it("handles nested objects and arrays together", () => {
    const result = luaLiteral({ items: [1, 2], meta: { count: 2 } });
    expect(result).toContain("items = {1, 2}");
    expect(result).toContain("meta = {count = 2}");
  });
});

// ============================================================================
// ContainerFailureError
// ============================================================================

describe("ContainerFailureError", () => {
  it("stores exit code", () => {
    const err = new ContainerFailureError("failed", 127);
    expect(err.exitCode).toBe(127);
    expect(err.message).toBe("failed");
    expect(err.name).toBe("ContainerFailureError");
  });

  it("is an instance of Error", () => {
    const err = new ContainerFailureError("test", 1);
    expect(err).toBeInstanceOf(Error);
  });

  it("works with zero exit code", () => {
    const err = new ContainerFailureError("unexpected", 0);
    expect(err.exitCode).toBe(0);
  });
});
