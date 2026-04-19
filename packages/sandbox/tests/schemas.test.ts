import { describe, it, expect } from "vitest";
import {
  FileReadInput,
  FileWriteInput,
  ShellExecInput,
  ShellWaitInput
} from "../src/schemas/index.js";

describe("schemas / file", () => {
  it("accepts a minimal file_read input", () => {
    const parsed = FileReadInput.parse({ file: "/tmp/x.txt" });
    expect(parsed.file).toBe("/tmp/x.txt");
  });

  it("rejects empty file paths", () => {
    expect(() => FileReadInput.parse({ file: "" })).toThrow();
  });

  it("accepts line ranges", () => {
    const parsed = FileReadInput.parse({
      file: "/tmp/x.txt",
      start_line: 0,
      end_line: 10
    });
    expect(parsed.end_line).toBe(10);
  });

  it("rejects negative line numbers", () => {
    expect(() =>
      FileReadInput.parse({ file: "/tmp/x.txt", start_line: -1 })
    ).toThrow();
  });

  it("accepts a file_write with append and sudo", () => {
    const parsed = FileWriteInput.parse({
      file: "/etc/hosts",
      content: "127.0.0.1 x",
      append: true,
      sudo: true
    });
    expect(parsed.append).toBe(true);
    expect(parsed.sudo).toBe(true);
  });
});

describe("schemas / shell", () => {
  it("accepts a minimal shell_exec input", () => {
    const parsed = ShellExecInput.parse({ id: "s1", command: "ls" });
    expect(parsed.id).toBe("s1");
  });

  it("rejects empty session ids", () => {
    expect(() => ShellExecInput.parse({ id: "", command: "ls" })).toThrow();
  });

  it("rejects empty commands", () => {
    expect(() => ShellExecInput.parse({ id: "s1", command: "" })).toThrow();
  });

  it("rejects non-positive wait seconds", () => {
    expect(() =>
      ShellWaitInput.parse({ id: "s1", seconds: 0 })
    ).toThrow();
  });
});
