import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvFile, parseEnvFile } from "../env-file.js";

describe("parseEnvFile", () => {
  it("parses simple KEY=VALUE pairs", () => {
    expect(parseEnvFile("A=1\nB=two")).toEqual({ A: "1", B: "two" });
  });

  it("skips blank lines and # comments", () => {
    const input = "\n# a comment\nA=1\n\n  # indented comment\nB=2\n";
    expect(parseEnvFile(input)).toEqual({ A: "1", B: "2" });
  });

  it("strips an optional export prefix", () => {
    expect(parseEnvFile("export A=1\nexport B=2")).toEqual({ A: "1", B: "2" });
  });

  it("trims unquoted values", () => {
    expect(parseEnvFile("A=  spaced  ")).toEqual({ A: "spaced" });
  });

  it("keeps single-quoted values literal", () => {
    expect(parseEnvFile("A='line\\n still'")).toEqual({ A: "line\\n still" });
  });

  it("expands \\n \\r \\t in double-quoted values", () => {
    expect(parseEnvFile('A="line1\\nline2\\tend"')).toEqual({
      A: "line1\nline2\tend"
    });
  });

  it("preserves surrounding whitespace inside quotes", () => {
    expect(parseEnvFile('A="  padded  "')).toEqual({ A: "  padded  " });
  });

  it("handles values containing =", () => {
    expect(parseEnvFile("URL=postgres://u:p@h/db?a=b&c=d")).toEqual({
      URL: "postgres://u:p@h/db?a=b&c=d"
    });
  });

  it("ignores lines without = and empty keys", () => {
    expect(parseEnvFile("NOTAKEY\n=value\nA=1")).toEqual({ A: "1" });
  });
});

describe("loadEnvFile", () => {
  let dir: string;
  const created: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envfile-"));
  });

  afterEach(() => {
    for (const key of created) delete process.env[key];
    created.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string): string => {
    const file = join(dir, name);
    writeFileSync(file, content);
    return file;
  };

  it("applies pairs to process.env", () => {
    created.push("ENVFILE_TEST_A");
    const file = write(".env", "ENVFILE_TEST_A=hello");
    const parsed = loadEnvFile(fs, file);
    expect(parsed).toEqual({ ENVFILE_TEST_A: "hello" });
    expect(process.env.ENVFILE_TEST_A).toBe("hello");
  });

  it("overrides existing process.env values", () => {
    created.push("ENVFILE_TEST_B");
    process.env.ENVFILE_TEST_B = "first";
    const first = write(".env", "ENVFILE_TEST_B=first-file");
    loadEnvFile(fs, first);
    expect(process.env.ENVFILE_TEST_B).toBe("first-file");

    const second = write(".env.local", "ENVFILE_TEST_B=second-file");
    loadEnvFile(fs, second);
    expect(process.env.ENVFILE_TEST_B).toBe("second-file");
  });

  it("tolerates a missing file silently", () => {
    const parsed = loadEnvFile(fs, join(dir, "does-not-exist.env"));
    expect(parsed).toEqual({});
  });
});
