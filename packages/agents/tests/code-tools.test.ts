import { describe, it, expect } from "vitest";
import { RunCodeTool } from "../src/tools/code-tools.js";
import type { ProcessingContext } from "@nodetool/runtime";

const mockContext = {} as ProcessingContext;

describe("RunCodeTool", () => {
  const tool = new RunCodeTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("run_code");
    const pt = tool.toProviderTool();
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toEqual(
      expect.arrayContaining(["language", "code"]),
    );
  });

  it("executes simple JavaScript", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: 'console.log("hello from js")',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from js");
  });

  it("executes Python print", async () => {
    const result = await tool.process(mockContext, {
      language: "python",
      code: 'print("hello from python")',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from python");
  });

  it("executes Bash echo", async () => {
    const result = await tool.process(mockContext, {
      language: "bash",
      code: 'echo "hello from bash"',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from bash");
  });

  it("captures stderr", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: 'console.error("oops")',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("oops");
  });

  it("returns non-zero exit code on error", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: "process.exit(42)",
    });
    expect(result.exitCode).not.toBe(0);
  });

  it("handles timeout", async () => {
    const shortTimeoutTool = new RunCodeTool({ timeoutMs: 500 });
    const result = await shortTimeoutTool.process(mockContext, {
      language: "javascript",
      code: "setTimeout(() => {}, 60000); // hang for 60s",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("timeout");
  }, 10_000);

  it("returns error for empty code", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: "   ",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No code provided");
  });

  it("returns error for unsupported language", async () => {
    const result = await tool.process(mockContext, {
      language: "ruby",
      code: 'puts "hi"',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unsupported language");
  });

  it("userMessage includes language", () => {
    const msg = tool.userMessage({ language: "python", code: "x = 1" });
    expect(msg).toContain("python");
  });

  it("userMessage shows short code snippets", () => {
    const msg = tool.userMessage({
      language: "bash",
      code: "echo hi",
    });
    expect(msg).toContain("echo hi");
  });

  it("userMessage uses ellipsis for long code", () => {
    const msg = tool.userMessage({
      language: "javascript",
      code: "a".repeat(100),
    });
    expect(msg).toContain("...");
    expect(msg).not.toContain("a".repeat(100));
  });

  it("userMessage handles missing params", () => {
    const msg = tool.userMessage({});
    expect(msg).toBe("Executing code...");
  });

  it("userMessage handles empty code", () => {
    const msg = tool.userMessage({ language: "python", code: "" });
    expect(msg).toBe("Executing python...");
  });

  it("returns error for undefined code", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No code provided");
  });

  it("returns error for non-string code", async () => {
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: 123 as any,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No code provided");
  });
});
