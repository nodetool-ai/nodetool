import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveExamplesDir } from "../src/test-ui-server.js";

const LAYOUT_MONO = ["nodetool", "examples", "nodetool-base"];
const LAYOUT_SRC = ["src", "nodetool", "examples", "nodetool-base"];

function makeTree(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "examples-dir-")));
}

function cwdAt(dir: string): void {
  vi.spyOn(process, "cwd").mockReturnValue(dir);
}

describe("resolveExamplesDir", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prefers an existing options.examplesDir", () => {
    const root = makeTree();
    const dir = join(root, "explicit");
    mkdirSync(dir);
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", root);
    expect(resolveExamplesDir({ examplesDir: dir })).toBe(dir);
  });

  it("falls back to the env dir when options.examplesDir does not exist", () => {
    const root = makeTree();
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", root);
    expect(resolveExamplesDir({ examplesDir: join(root, "missing") })).toBe(root);
  });

  it("ignores a missing env dir and finds the monorepo layout from cwd", () => {
    const root = makeTree();
    const examples = join(root, "packages", "base-nodes", ...LAYOUT_MONO);
    mkdirSync(examples, { recursive: true });
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", join(root, "missing"));
    cwdAt(root);
    expect(resolveExamplesDir({})).toBe(examples);
  });

  it("finds the installed layout in an ancestor of cwd", () => {
    const root = makeTree();
    const examples = join(root, ...LAYOUT_SRC);
    mkdirSync(examples, { recursive: true });
    const cwd = join(root, "a", "b");
    mkdirSync(cwd, { recursive: true });
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", "");
    cwdAt(cwd);
    expect(resolveExamplesDir({})).toBe(examples);
  });

  it("prefers the monorepo layout over the installed layout in one root", () => {
    const root = makeTree();
    mkdirSync(join(root, ...LAYOUT_SRC), { recursive: true });
    mkdirSync(join(root, ...LAYOUT_MONO), { recursive: true });
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", "");
    cwdAt(root);
    expect(resolveExamplesDir({})).toBe(join(root, ...LAYOUT_MONO));
  });

  it("finds a sibling nodetool-base checkout in the workspace root", () => {
    const ws = makeTree();
    const examples = join(ws, "nodetool-base", ...LAYOUT_SRC);
    mkdirSync(examples, { recursive: true });
    const cwd = join(ws, "x", "y", "z", "w");
    mkdirSync(cwd, { recursive: true });
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", "");
    cwdAt(cwd);
    expect(resolveExamplesDir({})).toBe(examples);
  });

  it("returns null when no layout exists", () => {
    const root = makeTree();
    vi.stubEnv("NODETOOL_BASE_EXAMPLES_DIR", "");
    cwdAt(root);
    expect(resolveExamplesDir({})).toBeNull();
  });
});
