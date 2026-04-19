import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fileRead,
  fileWrite,
  fileStrReplace,
  fileFindInContent,
  fileFindByName
} from "../src/tools/file.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "nt-sandbox-file-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("fileWrite / fileRead", () => {
  it("writes then reads back content", async () => {
    const f = join(root, "a.txt");
    const w = await fileWrite({ file: f, content: "hello\nworld" });
    expect(w.bytes_written).toBe(11);
    expect(w.file).toBe(f);

    const r = await fileRead({ file: f });
    expect(r.content).toBe("hello\nworld");
    expect(r.total_lines).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it("appends when append=true", async () => {
    const f = join(root, "a.txt");
    await fileWrite({ file: f, content: "hello" });
    await fileWrite({ file: f, content: "-world", append: true });
    const r = await fileRead({ file: f });
    expect(r.content).toBe("hello-world");
  });

  it("applies leading_newline and trailing_newline", async () => {
    const f = join(root, "a.txt");
    await fileWrite({
      file: f,
      content: "mid",
      leading_newline: true,
      trailing_newline: true
    });
    const r = await fileRead({ file: f });
    expect(r.content).toBe("\nmid\n");
  });

  it("creates parent directories", async () => {
    const f = join(root, "deep", "nest", "a.txt");
    await fileWrite({ file: f, content: "x" });
    const r = await fileRead({ file: f });
    expect(r.content).toBe("x");
  });

  it("supports start_line/end_line slicing", async () => {
    const f = join(root, "lines.txt");
    await fileWrite({ file: f, content: "a\nb\nc\nd\ne" });
    const r = await fileRead({ file: f, start_line: 2, end_line: 4 });
    expect(r.content).toBe("b\nc\nd");
    expect(r.total_lines).toBe(5);
  });
});

describe("fileStrReplace", () => {
  it("replaces all occurrences", async () => {
    const f = join(root, "a.txt");
    await fileWrite({ file: f, content: "foo bar foo baz" });
    const out = await fileStrReplace({
      file: f,
      old_str: "foo",
      new_str: "qux"
    });
    expect(out.replacements).toBe(2);
    const r = await fileRead({ file: f });
    expect(r.content).toBe("qux bar qux baz");
  });

  it("throws when old_str is missing", async () => {
    const f = join(root, "a.txt");
    await fileWrite({ file: f, content: "nothing here" });
    await expect(
      fileStrReplace({ file: f, old_str: "missing", new_str: "x" })
    ).rejects.toThrow(/not found/);
  });
});

describe("fileFindInContent", () => {
  it("returns matching lines with line numbers", async () => {
    const f = join(root, "a.txt");
    await fileWrite({
      file: f,
      content: "alpha\nbravo 42\ncharlie\ndelta 7"
    });
    const out = await fileFindInContent({ file: f, regex: "\\d+" });
    expect(out.matches).toHaveLength(2);
    expect(out.matches[0]).toMatchObject({
      line_number: 2,
      match: "42"
    });
    expect(out.matches[1]).toMatchObject({
      line_number: 4,
      match: "7"
    });
  });
});

describe("fileFindByName", () => {
  it("finds files by glob", async () => {
    await fileWrite({ file: join(root, "a.txt"), content: "1" });
    await fileWrite({ file: join(root, "b.txt"), content: "2" });
    await fileWrite({ file: join(root, "c.md"), content: "3" });
    const out = await fileFindByName({ path: root, glob: "*.txt" });
    expect(out.paths.sort()).toEqual(
      [join(root, "a.txt"), join(root, "b.txt")].sort()
    );
  });

  it("returns empty array when nothing matches", async () => {
    const out = await fileFindByName({ path: root, glob: "*.nothing" });
    expect(out.paths).toEqual([]);
  });
});
