import { describe, it, expect } from "vitest";
import { BashDockerRunner } from "../src/bash-runner.js";
import { JavaScriptDockerRunner } from "../src/javascript-runner.js";
import { PythonDockerRunner } from "../src/python-runner.js";
import { RubyDockerRunner } from "../src/ruby-runner.js";
import { CommandDockerRunner } from "../src/command-runner.js";
import {
  LuaRunner,
  LuaSubprocessRunner,
  luaEscapeString,
  luaLiteral
} from "../src/lua-runner.js";

// ============================================================================
// BashDockerRunner
// ============================================================================

describe("BashDockerRunner", () => {
  it("uses bash:5.2 as default image", () => {
    const runner = new BashDockerRunner();
    expect(runner.image).toBe("bash:5.2");
  });

  it("accepts a custom image", () => {
    const runner = new BashDockerRunner({ image: "bash:4.4" });
    expect(runner.image).toBe("bash:4.4");
  });

  it("builds command with no locals", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("echo hello", {});
    expect(cmd).toEqual(["bash", "-lc", "set -e\necho hello"]);
  });

  it("prepends set -e before user code", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("exit 0", {});
    expect(cmd[2].startsWith("set -e\n")).toBe(true);
  });

  it("injects string locals as JSON-quoted variables", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("echo $x", { x: "world" });
    expect(cmd[2]).toContain('x="world"\n');
  });

  it("injects number locals as plain number strings", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("echo $n", { n: 42 });
    expect(cmd[2]).toContain("n=42\n");
  });

  it("injects boolean true as True", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { flag: true });
    expect(cmd[2]).toContain("flag=True\n");
  });

  it("injects boolean false as False", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { flag: false });
    expect(cmd[2]).toContain("flag=False\n");
  });

  it("injects null as None", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: null });
    expect(cmd[2]).toContain("v=None\n");
  });

  it("injects undefined as None", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: undefined });
    expect(cmd[2]).toContain("v=None\n");
  });

  it("injects array locals", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { arr: [1, 2, 3] });
    expect(cmd[2]).toContain("arr=[1, 2, 3]\n");
  });

  it("injects nested array locals", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { nested: [[1, 2], [3]] });
    expect(cmd[2]).toContain("nested=[[1, 2], [3]]\n");
  });

  it("injects object locals in Python dict style", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("", { obj: { a: 1 } });
    expect(cmd[2]).toContain('"a": 1');
  });

  it("places user code after all locals", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("echo $x", { x: 1 });
    const code = cmd[2];
    const localIdx = code.indexOf("x=1");
    const userIdx = code.indexOf("echo $x");
    expect(localIdx).toBeLessThan(userIdx);
  });

  it("returns bash command array with 3 elements", () => {
    const runner = new BashDockerRunner();
    const cmd = runner.buildContainerCommand("echo hi", {});
    expect(cmd).toHaveLength(3);
    expect(cmd[0]).toBe("bash");
    expect(cmd[1]).toBe("-lc");
  });
});

// ============================================================================
// JavaScriptDockerRunner
// ============================================================================

describe("JavaScriptDockerRunner", () => {
  it("uses node:22-alpine as default image", () => {
    const runner = new JavaScriptDockerRunner();
    expect(runner.image).toBe("node:22-alpine");
  });

  it("accepts a custom image", () => {
    const runner = new JavaScriptDockerRunner({ image: "node:18-alpine" });
    expect(runner.image).toBe("node:18-alpine");
  });

  it("builds command with no locals", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand('console.log("hi")', {});
    expect(cmd).toEqual(["node", "-e", 'console.log("hi")']);
  });

  it("injects number locals as const declarations", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("console.log(x)", { x: 42 });
    expect(cmd[2]).toContain("const x = 42;\n");
  });

  it("injects string locals using JSON serialization", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { msg: "hello world" });
    expect(cmd[2]).toContain('const msg = "hello world";\n');
  });

  it("injects boolean true as JSON true", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { flag: true });
    expect(cmd[2]).toContain("const flag = true;\n");
  });

  it("injects boolean false as JSON false", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { flag: false });
    expect(cmd[2]).toContain("const flag = false;\n");
  });

  it("injects null as JSON null", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: null });
    expect(cmd[2]).toContain("const v = null;\n");
  });

  it("injects object locals as JSON object", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { obj: { key: "val" } });
    expect(cmd[2]).toContain('const obj = {"key":"val"};\n');
  });

  it("injects array locals as JSON array", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", { list: [1, 2, 3] });
    expect(cmd[2]).toContain("const list = [1,2,3];\n");
  });

  it("places user code after all locals", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("console.log(x)", { x: 1 });
    const code = cmd[2];
    const localIdx = code.indexOf("const x");
    const userIdx = code.indexOf("console.log(x)");
    expect(localIdx).toBeLessThan(userIdx);
  });

  it("returns node command array with 3 elements", () => {
    const runner = new JavaScriptDockerRunner();
    const cmd = runner.buildContainerCommand("", {});
    expect(cmd).toHaveLength(3);
    expect(cmd[0]).toBe("node");
    expect(cmd[1]).toBe("-e");
  });
});

// ============================================================================
// PythonDockerRunner
// ============================================================================

describe("PythonDockerRunner", () => {
  it("uses python:3.11-slim as default image", () => {
    const runner = new PythonDockerRunner();
    expect(runner.image).toBe("python:3.11-slim");
  });

  it("accepts a custom image", () => {
    const runner = new PythonDockerRunner({ image: "python:3.9-slim" });
    expect(runner.image).toBe("python:3.9-slim");
  });

  it("builds command with no locals", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand('print("hi")', {});
    expect(cmd).toEqual(["python", "-c", 'print("hi")']);
  });

  it("injects number locals", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("print(x)", { x: 10 });
    expect(cmd[2]).toContain("x=10\n");
  });

  it("injects float locals", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { pi: 3.14 });
    expect(cmd[2]).toContain("pi=3.14\n");
  });

  it("injects boolean true as True", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { t: true });
    expect(cmd[2]).toContain("t=True\n");
  });

  it("injects boolean false as False", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { f: false });
    expect(cmd[2]).toContain("f=False\n");
  });

  it("injects null as None", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: null });
    expect(cmd[2]).toContain("v=None\n");
  });

  it("injects undefined as None", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: undefined });
    expect(cmd[2]).toContain("v=None\n");
  });

  it("injects string with JSON quoting (valid Python string literal)", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { s: "hello" });
    expect(cmd[2]).toContain('s="hello"\n');
  });

  it("injects list literal", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { lst: [1, 2] });
    expect(cmd[2]).toContain("lst=[1, 2]\n");
  });

  it("injects dict literal", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("", { d: { a: 1, b: 2 } });
    expect(cmd[2]).toContain('"a": 1');
    expect(cmd[2]).toContain('"b": 2');
  });

  it("returns python command array with 3 elements", () => {
    const runner = new PythonDockerRunner();
    const cmd = runner.buildContainerCommand("pass", {});
    expect(cmd).toHaveLength(3);
    expect(cmd[0]).toBe("python");
    expect(cmd[1]).toBe("-c");
  });
});

// ============================================================================
// RubyDockerRunner
// ============================================================================

describe("RubyDockerRunner", () => {
  it("uses ruby:3.3-alpine as default image", () => {
    const runner = new RubyDockerRunner();
    expect(runner.image).toBe("ruby:3.3-alpine");
  });

  it("accepts a custom image", () => {
    const runner = new RubyDockerRunner({ image: "ruby:3.2-alpine" });
    expect(runner.image).toBe("ruby:3.2-alpine");
  });

  it("builds command with no locals", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand('puts "hi"', {});
    expect(cmd).toEqual(["ruby", "-e", 'puts "hi"']);
  });

  it("injects null as nil", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: null });
    expect(cmd[2]).toContain("v=nil\n");
  });

  it("injects undefined as nil", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { v: undefined });
    expect(cmd[2]).toContain("v=nil\n");
  });

  it("injects boolean true as true", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { t: true });
    expect(cmd[2]).toContain("t=true\n");
  });

  it("injects boolean false as false", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { f: false });
    expect(cmd[2]).toContain("f=false\n");
  });

  it("injects number", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { n: 3.14 });
    expect(cmd[2]).toContain("n=3.14\n");
  });

  it("injects string with JSON quoting", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { s: "hello" });
    expect(cmd[2]).toContain('s="hello"\n');
  });

  it("injects array literal", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { arr: [1, 2, 3] });
    expect(cmd[2]).toContain("arr=[1, 2, 3]\n");
  });

  it("injects hash with Ruby hash-rocket syntax", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand("", { h: { key: "val" } });
    expect(cmd[2]).toContain("=>");
  });

  it("returns ruby command array with 3 elements", () => {
    const runner = new RubyDockerRunner();
    const cmd = runner.buildContainerCommand('puts "hi"', {});
    expect(cmd).toHaveLength(3);
    expect(cmd[0]).toBe("ruby");
    expect(cmd[1]).toBe("-e");
  });
});

// ============================================================================
// CommandDockerRunner
// ============================================================================

describe("CommandDockerRunner", () => {
  it("uses bash:5.2 as default image", () => {
    const runner = new CommandDockerRunner();
    expect(runner.image).toBe("bash:5.2");
  });

  it("accepts a custom image", () => {
    const runner = new CommandDockerRunner({ image: "alpine:3.18" });
    expect(runner.image).toBe("alpine:3.18");
  });

  it("splits user code on spaces", () => {
    const runner = new CommandDockerRunner();
    const cmd = runner.buildContainerCommand("ls -la /tmp", {});
    expect(cmd).toEqual(["ls", "-la", "/tmp"]);
  });

  it("ignores envLocals", () => {
    const runner = new CommandDockerRunner();
    const cmd = runner.buildContainerCommand("echo hello", { x: 1, y: "z" });
    expect(cmd).toEqual(["echo", "hello"]);
  });

  it("handles single-token command", () => {
    const runner = new CommandDockerRunner();
    expect(runner.buildContainerCommand("pwd", {})).toEqual(["pwd"]);
  });

  it("handles empty string command", () => {
    const runner = new CommandDockerRunner();
    // split('') on empty string yields [""]
    expect(runner.buildContainerCommand("", {})).toEqual([""]);
  });
});

// ============================================================================
// luaEscapeString
// ============================================================================

describe("luaEscapeString", () => {
  it("wraps normal string in long-bracket syntax", () => {
    expect(luaEscapeString("hello")).toBe("[===[hello]===]");
  });

  it("wraps empty string in long-bracket syntax", () => {
    expect(luaEscapeString("")).toBe("[===[" + "" + "]===]");
  });

  it("wraps multiline string preserving newlines", () => {
    const s = "line1\nline2";
    expect(luaEscapeString(s)).toBe("[===[line1\nline2]===]");
  });

  it("wraps string with embedded quotes", () => {
    const s = 'say "hello"';
    expect(luaEscapeString(s)).toBe('[===[say "hello"]===]');
  });

  it("falls back to escaped double-quoted string when ]===] present", () => {
    const s = "a]===]b";
    const result = luaEscapeString(s);
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // Not wrapped in long-bracket syntax
    expect(result).not.toMatch(/^\[===\[/);
  });

  it("escaped fallback wraps special chars", () => {
    const s = "x]===]y\nz";
    const result = luaEscapeString(s);
    // Should be double-quoted with escape sequences
    expect(result.startsWith('"')).toBe(true);
    expect(result).toContain("\\n");
  });
});

// ============================================================================
// luaLiteral
// ============================================================================

describe("luaLiteral", () => {
  it("returns nil for null", () => {
    expect(luaLiteral(null)).toBe("nil");
  });

  it("returns nil for undefined", () => {
    expect(luaLiteral(undefined)).toBe("nil");
  });

  it("returns true for boolean true", () => {
    expect(luaLiteral(true)).toBe("true");
  });

  it("returns false for boolean false", () => {
    expect(luaLiteral(false)).toBe("false");
  });

  it("returns string representation of integer", () => {
    expect(luaLiteral(42)).toBe("42");
  });

  it("returns string representation of float", () => {
    expect(luaLiteral(3.14)).toBe("3.14");
  });

  it("returns string representation of zero", () => {
    expect(luaLiteral(0)).toBe("0");
  });

  it("wraps string in long-bracket escape", () => {
    expect(luaLiteral("hello")).toBe("[===[hello]===]");
  });

  it("encodes empty array as empty Lua table", () => {
    expect(luaLiteral([])).toBe("{}");
  });

  it("encodes number array", () => {
    expect(luaLiteral([1, 2, 3])).toBe("{1, 2, 3}");
  });

  it("encodes mixed array", () => {
    const result = luaLiteral([1, "x", true, null]);
    expect(result).toBe("{1, [===[x]===], true, nil}");
  });

  it("encodes nested array", () => {
    expect(luaLiteral([[1, 2], [3]])).toBe("{{1, 2}, {3}}");
  });

  it("encodes object with valid identifier key using field syntax", () => {
    expect(luaLiteral({ x: 1 })).toBe("{x = 1}");
  });

  it("encodes object with multiple fields", () => {
    const result = luaLiteral({ a: 1, b: 2 });
    expect(result).toContain("a = 1");
    expect(result).toContain("b = 2");
  });

  it("encodes object with non-identifier key using bracket syntax", () => {
    const result = luaLiteral({ "key-1": "val" });
    expect(result).toContain("[[===[key-1]===]]");
    expect(result).toContain("[===[val]===]");
  });

  it("returns nil when depth > 10", () => {
    expect(luaLiteral("value", 11)).toBe("nil");
  });

  it("returns nil at exact depth limit (depth=11)", () => {
    expect(luaLiteral([1], 11)).toBe("nil");
  });

  it("encodes non-object non-array unknown type as escaped string", () => {
    // Symbol falls through to the fallback
    const sym = Symbol("test");
    const result = luaLiteral(sym);
    expect(result.startsWith("[===[") || result.startsWith('"')).toBe(true);
  });
});

// ============================================================================
// LuaRunner
// ============================================================================

describe("LuaRunner", () => {
  it("uses nickblah/lua:5.2.4-luarocks-ubuntu as default image", () => {
    const runner = new LuaRunner();
    expect(runner.image).toBe("nickblah/lua:5.2.4-luarocks-ubuntu");
  });

  it("uses lua as default executable", () => {
    const runner = new LuaRunner();
    expect(runner.executable).toBe("lua");
  });

  it("accepts a custom executable", () => {
    const runner = new LuaRunner({ executable: "lua5.4" });
    expect(runner.executable).toBe("lua5.4");
  });

  it("accepts a custom image", () => {
    const runner = new LuaRunner({ image: "lua:5.4" });
    expect(runner.image).toBe("lua:5.4");
  });

  it("builds command with executable as first token", () => {
    const runner = new LuaRunner({ executable: "lua5.3" });
    const cmd = runner.buildContainerCommand('print("hi")', {});
    expect(cmd[0]).toBe("lua5.3");
    expect(cmd[1]).toBe("-e");
  });

  it("includes user code in lua snippet", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand('print("hello")', {});
    expect(cmd[2]).toContain('print("hello")');
  });

  it("wraps code inside a do...end block", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("print(1)", {});
    expect(cmd[2].startsWith("do ")).toBe(true);
    expect(cmd[2].endsWith("end")).toBe(true);
  });

  it("injects valid identifier locals into _ENV", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("print(x)", { x: 42 });
    expect(cmd[2]).toContain("_ENV[[===[x]===]] = 42");
  });

  it("injects string local as Lua string literal", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("", { msg: "hello" });
    expect(cmd[2]).toContain("_ENV[[===[msg]===]] = [===[hello]===]");
  });

  it("injects boolean local as Lua boolean", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("", { flag: true });
    expect(cmd[2]).toContain("_ENV[[===[flag]===]] = true");
  });

  it("skips invalid identifier keys (e.g. hyphenated names)", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("print(1)", { "invalid-key": 1 });
    expect(cmd[2]).not.toContain("invalid-key");
  });

  it("skips keys starting with a digit", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("print(1)", { "1bad": 1 });
    expect(cmd[2]).not.toContain("1bad");
  });

  it("returns command array with 3 elements", () => {
    const runner = new LuaRunner();
    const cmd = runner.buildContainerCommand("print(1)", {});
    expect(cmd).toHaveLength(3);
  });
});

// ============================================================================
// LuaSubprocessRunner
// ============================================================================

describe("LuaSubprocessRunner", () => {
  it("uses subprocess mode by default", () => {
    const runner = new LuaSubprocessRunner();
    expect(runner.mode).toBe("subprocess");
  });

  it("uses lua as default executable", () => {
    const runner = new LuaSubprocessRunner();
    expect(runner.executable).toBe("lua");
  });

  it("accepts a custom executable", () => {
    const runner = new LuaSubprocessRunner({ executable: "lua5.1" });
    expect(runner.executable).toBe("lua5.1");
  });

  it("still builds valid lua command", () => {
    const runner = new LuaSubprocessRunner();
    const cmd = runner.buildContainerCommand("print(1)", {});
    expect(cmd[0]).toBe("lua");
    expect(cmd[1]).toBe("-e");
  });
});
