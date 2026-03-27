import { describe, it, expect } from "vitest";
import { _parseMemLimit } from "../src/server-docker-runner.js";
import { _shellSplit } from "../src/server-subprocess-runner.js";

// ---------------------------------------------------------------------------
// parseMemLimit
// ---------------------------------------------------------------------------
describe("parseMemLimit", () => {
  it("parses kilobytes (k)", () => {
    expect(_parseMemLimit("512k")).toBe(512 * 1024);
  });

  it("parses kilobytes with b suffix (kb)", () => {
    expect(_parseMemLimit("512kb")).toBe(512 * 1024);
  });

  it("parses megabytes (m)", () => {
    expect(_parseMemLimit("256m")).toBe(256 * 1024 * 1024);
  });

  it("parses megabytes with b suffix (mb)", () => {
    expect(_parseMemLimit("256mb")).toBe(256 * 1024 * 1024);
  });

  it("parses gigabytes (g)", () => {
    expect(_parseMemLimit("2g")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("parses gigabytes with b suffix (gb)", () => {
    expect(_parseMemLimit("2gb")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("parses terabytes (t)", () => {
    expect(_parseMemLimit("1t")).toBe(1 * 1024 * 1024 * 1024 * 1024);
  });

  it("parses plain bytes (no unit)", () => {
    expect(_parseMemLimit("1048576")).toBe(1048576);
  });

  it("is case-insensitive", () => {
    expect(_parseMemLimit("256M")).toBe(256 * 1024 * 1024);
    expect(_parseMemLimit("2G")).toBe(2 * 1024 * 1024 * 1024);
    expect(_parseMemLimit("1T")).toBe(1 * 1024 * 1024 * 1024 * 1024);
  });

  it("returns default (256MB) for invalid input", () => {
    const defaultVal = 256 * 1024 * 1024;
    expect(_parseMemLimit("invalid")).toBe(defaultVal);
    expect(_parseMemLimit("")).toBe(defaultVal);
    expect(_parseMemLimit("abc123")).toBe(defaultVal);
  });
});

// ---------------------------------------------------------------------------
// shellSplit
// ---------------------------------------------------------------------------
describe("shellSplit", () => {
  it("splits simple space-separated tokens", () => {
    expect(_shellSplit("echo hello world")).toEqual(["echo", "hello", "world"]);
  });

  it("handles multiple spaces between tokens", () => {
    expect(_shellSplit("a   b   c")).toEqual(["a", "b", "c"]);
  });

  it("handles tabs as separators", () => {
    expect(_shellSplit("a\tb\tc")).toEqual(["a", "b", "c"]);
  });

  it("preserves single-quoted strings", () => {
    expect(_shellSplit("echo 'hello world'")).toEqual(["echo", "hello world"]);
  });

  it("preserves double-quoted strings", () => {
    expect(_shellSplit('echo "hello world"')).toEqual(["echo", "hello world"]);
  });

  it("handles escaped quotes in double quotes", () => {
    expect(_shellSplit('echo "say \\"hi\\""')).toEqual(["echo", 'say "hi"']);
  });

  it("returns empty array for empty string", () => {
    expect(_shellSplit("")).toEqual([]);
  });

  it("returns empty array for whitespace only", () => {
    expect(_shellSplit("   ")).toEqual([]);
  });

  it("handles mixed quoting styles", () => {
    expect(_shellSplit("a 'b c' \"d e\" f")).toEqual(["a", "b c", "d e", "f"]);
  });

  it("handles leading/trailing whitespace", () => {
    expect(_shellSplit("  hello  ")).toEqual(["hello"]);
  });

  it("handles single token with no spaces", () => {
    expect(_shellSplit("hello")).toEqual(["hello"]);
  });

  it("handles adjacent quoted segments", () => {
    expect(_shellSplit("'hello'\"world\"")).toEqual(["helloworld"]);
  });
});
