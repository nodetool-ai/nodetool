import { describe, it, expect } from "vitest";
import {
  isBasicTool,
  friendlyToolName,
  formatToolParams,
  formatToolResult,
  formatToolDiff,
} from "../src/tool-format.js";

describe("isBasicTool / friendlyToolName", () => {
  it("recognizes the builtin file/search/run tools", () => {
    for (const name of [
      "read_file",
      "write_file",
      "edit_file",
      "list_directory",
      "glob",
      "grep",
      "run_code",
      "js",
    ]) {
      expect(isBasicTool(name)).toBe(true);
    }
  });

  it("treats unknown tools as non-basic", () => {
    expect(isBasicTool("google_search")).toBe(false);
    expect(isBasicTool("browser")).toBe(false);
    expect(friendlyToolName("google_search")).toBe("google_search");
  });

  it("maps names to friendly verbs", () => {
    expect(friendlyToolName("read_file")).toBe("Read");
    expect(friendlyToolName("glob")).toBe("Search");
    expect(friendlyToolName("run_code")).toBe("Run");
  });
});

describe("formatToolParams", () => {
  it("read_file shows the path, with an optional line range", () => {
    expect(formatToolParams("read_file", { file_path: "src/app.tsx" })).toBe(
      "src/app.tsx"
    );
    expect(
      formatToolParams("read_file", { file_path: "a.ts", offset: 10, limit: 5 })
    ).toBe("a.ts, lines 10-14");
  });

  it("glob and grep show pattern (and path)", () => {
    expect(formatToolParams("glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
    expect(formatToolParams("glob", { pattern: "*.ts", path: "src" })).toBe(
      "*.ts in src"
    );
    expect(
      formatToolParams("grep", { pattern: "TODO", include: "*.ts", path: "src" })
    ).toBe('"TODO", *.ts in src');
  });

  it("list_directory defaults to the workspace root", () => {
    expect(formatToolParams("list_directory", {})).toBe(".");
  });

  it("run_code shows a truncated first line of code", () => {
    expect(formatToolParams("run_code", { code: "console.log(1)\nmore()" })).toBe(
      "console.log(1)"
    );
  });

  it("falls back to key: value for unknown tools", () => {
    expect(formatToolParams("whatever", { a: 1, b: "x" })).toBe(
      'a: 1, b: "x"'
    );
  });
});

describe("formatToolResult", () => {
  it("counts read_file lines and drops the truncation note", () => {
    const body = "1\tconst a = 1\n2\tconst b = 2\n3\tconst c = 3";
    expect(formatToolResult("read_file", undefined, body)).toBe("Read 3 lines");
    expect(
      formatToolResult(
        "read_file",
        undefined,
        body + "\n\n[showing lines 1-3 of 99; use offset=4 to continue]"
      )
    ).toBe("Read 3 lines");
  });

  it("read_file surfaces errors", () => {
    expect(
      formatToolResult("read_file", undefined, "Error: x does not exist")
    ).toBe("Error: x does not exist");
  });

  it("write_file echoes the Created/Updated summary", () => {
    expect(formatToolResult("write_file", undefined, "Created notes.md")).toBe(
      "Created notes.md"
    );
  });

  it("list_directory counts entries and handles empty", () => {
    expect(formatToolResult("list_directory", undefined, "a/\nb.txt\t10 bytes")).toBe(
      "Listed 2 items"
    );
    expect(formatToolResult("list_directory", undefined, "(empty) docs")).toBe(
      "Empty directory"
    );
  });

  it("edit_file reports replacements / creation / errors", () => {
    expect(
      formatToolResult("edit_file", undefined, {
        success: true,
        path: "a.ts",
        replacements: 1,
      })
    ).toBe("Updated a.ts (1 edit)");
    expect(
      formatToolResult("edit_file", undefined, {
        success: true,
        path: "a.ts",
        replacements: 3,
      })
    ).toBe("Updated a.ts (3 edits)");
    expect(
      formatToolResult("edit_file", undefined, {
        success: true,
        path: "new.ts",
        created: true,
      })
    ).toBe("Created new.ts");
    expect(
      formatToolResult("edit_file", undefined, {
        success: false,
        error: "old_string not found in file. Make sure…",
      })
    ).toMatch(/^Error: old_string not found/);
  });

  it("glob and grep report match counts", () => {
    expect(
      formatToolResult("glob", undefined, { success: true, match_count: 5 })
    ).toBe("Found 5 files");
    expect(
      formatToolResult("glob", undefined, {
        success: true,
        match_count: 100,
        truncated: true,
      })
    ).toBe("Found 100 files (truncated)");
    expect(
      formatToolResult("grep", undefined, { success: true, match_count: 1 })
    ).toBe("Found 1 match");
  });

  it("run_code reports output and exit status", () => {
    expect(
      formatToolResult("run_code", undefined, {
        stdout: "42\nmore",
        stderr: "",
        exitCode: 0,
      })
    ).toBe("42");
    expect(
      formatToolResult("run_code", undefined, {
        stdout: "",
        stderr: "",
        exitCode: 0,
      })
    ).toBe("Ran (no output)");
    expect(
      formatToolResult("run_code", undefined, {
        stdout: "",
        stderr: "ReferenceError: x is not defined",
        exitCode: 1,
      })
    ).toBe("Error: ReferenceError: x is not defined");
  });

  it("groups large counts with thousands separators", () => {
    const body = Array.from({ length: 1234 }, (_, i) => `${i + 1}\tline`).join("\n");
    expect(formatToolResult("read_file", undefined, body)).toBe("Read 1,234 lines");
    expect(
      formatToolResult("grep", undefined, { success: true, match_count: 2051 })
    ).toBe("Found 2,051 matches");
  });

  it("falls back to a one-line preview for unexpected shapes (e.g. WS strings)", () => {
    // WebSocket path delivers object-tool results as pre-serialized strings.
    expect(
      formatToolResult("grep", undefined, '{"success":true,"match_count":3}')
    ).toBe('{"success":true,"match_count":3}');
  });
});

describe("formatToolDiff", () => {
  it("only diffs edit_file", () => {
    expect(formatToolDiff("write_file", { content: "x" })).toBeNull();
    expect(formatToolDiff("read_file", { file_path: "a" })).toBeNull();
  });

  it("trims shared leading/trailing lines and marks the change", () => {
    const diff = formatToolDiff("edit_file", {
      old_string: "a\nOLD\nc",
      new_string: "a\nNEW\nc",
    });
    expect(diff).toEqual([
      { sign: "-", text: "OLD" },
      { sign: "+", text: "NEW" },
    ]);
  });

  it("represents a pure addition as + lines", () => {
    const diff = formatToolDiff("edit_file", {
      old_string: "a\nc",
      new_string: "a\nb\nc",
    });
    expect(diff).toEqual([{ sign: "+", text: "b" }]);
  });

  it("caps long diffs with a +N more note", () => {
    const newStr = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const diff = formatToolDiff("edit_file", { old_string: "", new_string: newStr });
    expect(diff).not.toBeNull();
    expect(diff!.length).toBe(9); // 8 lines + 1 note
    expect(diff![8]).toEqual({ sign: " ", text: "… +12 more lines" });
  });
});
