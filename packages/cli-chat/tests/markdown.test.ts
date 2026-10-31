/**
 * Tests for src/markdown.ts
 * Markdown rendering: stripMarkdown (sync) and renderMarkdown (async).
 */
import { describe, expect, it, vi } from "vitest";

// ─── stripMarkdown ────────────────────────────────────────────────────────────

describe("stripMarkdown", () => {
  it("removes fenced code blocks, replacing them with [code]", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    const input = "before\n```js\nconsole.log('hi');\n```\nafter";
    expect(stripMarkdown(input)).toBe("before\n[code]\nafter");
  });

  it("strips inline code backticks, keeping the inner text", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("Use `const` here")).toBe("Use const here");
  });

  it("strips bold markers (**)", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("This is **bold** text")).toBe("This is bold text");
  });

  it("strips italic markers (*)", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("This is *italic* text")).toBe("This is italic text");
  });

  it("strips ATX heading markers (#, ##, ###, etc.)", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("# Heading 1")).toBe("Heading 1");
    expect(stripMarkdown("## Heading 2")).toBe("Heading 2");
    expect(stripMarkdown("### Heading 3")).toBe("Heading 3");
    expect(stripMarkdown("###### Heading 6")).toBe("Heading 6");
  });

  it("strips markdown links, keeping the link text", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("Visit [NodeTool](https://nodetool.ai)")).toBe(
      "Visit NodeTool"
    );
  });

  it("leaves plain text unchanged", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    const plain = "Hello world, this is plain text.";
    expect(stripMarkdown(plain)).toBe(plain);
  });

  it("handles multiple formatting constructs in one string", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    const input = "## Title\n**bold** and *italic* and `code` and [link](url)";
    const result = stripMarkdown(input);
    expect(result).toBe("Title\nbold and italic and code and link");
  });

  it("handles empty string", async () => {
    const { stripMarkdown } = await import("../src/markdown.js");
    expect(stripMarkdown("")).toBe("");
  });
});

// ─── renderMarkdown ───────────────────────────────────────────────────────────

describe("renderMarkdown", () => {
  it("falls back to raw text when marked-terminal throws", async () => {
    vi.resetModules();
    // Mock marked-terminal to throw during initialization
    vi.doMock("marked-terminal", () => ({
      markedTerminal: () => {
        throw new Error("terminal unavailable");
      }
    }));
    // marked itself also fails (no terminal extension configured), so we mock
    // it to throw too — the outer try/catch should return raw text.
    vi.doMock("marked", () => ({
      marked: Object.assign(
        () => {
          throw new Error("parse error");
        },
        { use: (_ext: unknown) => {} }
      )
    }));
    const { renderMarkdown } = await import("../src/markdown.js");
    const raw = "# Hello **world**";
    const result = await renderMarkdown(raw);
    expect(result).toBe(raw);
  });

  it("falls back to raw text when marked itself throws", async () => {
    vi.resetModules();
    // Mock marked-terminal to succeed but marked().parse to throw
    vi.doMock("marked-terminal", () => ({
      markedTerminal: () => ({ extensions: [] })
    }));
    vi.doMock("marked", () => ({
      marked: Object.assign(
        () => {
          throw new Error("parse error");
        },
        { use: () => {} }
      )
    }));
    const { renderMarkdown } = await import("../src/markdown.js");
    const raw = "some text";
    const result = await renderMarkdown(raw);
    expect(result).toBe(raw);
  });

  it("returns a string result (async path)", async () => {
    vi.resetModules();
    // Mock marked-terminal to succeed; marked returns a Promise<string>
    vi.doMock("marked-terminal", () => ({
      markedTerminal: () => ({ extensions: [] })
    }));
    vi.doMock("marked", () => ({
      marked: Object.assign(
        (_text: string) => Promise.resolve("rendered output"),
        {
          use: () => {}
        }
      )
    }));
    const { renderMarkdown } = await import("../src/markdown.js");
    const result = await renderMarkdown("# heading");
    expect(result).toBe("rendered output");
  });

  it("returns a string result (sync path)", async () => {
    vi.resetModules();
    vi.doMock("marked-terminal", () => ({
      markedTerminal: () => ({ extensions: [] })
    }));
    vi.doMock("marked", () => ({
      marked: Object.assign((_text: string) => "sync rendered", {
        use: () => {}
      })
    }));
    const { renderMarkdown } = await import("../src/markdown.js");
    const result = await renderMarkdown("plain text");
    expect(result).toBe("sync rendered");
  });

  it("calls marked.use with terminal extension on first invocation only", async () => {
    vi.resetModules();
    const useSpy = vi.fn();
    vi.doMock("marked-terminal", () => ({
      markedTerminal: () => ({ extensions: [] })
    }));
    vi.doMock("marked", () => ({
      marked: Object.assign((_text: string) => "ok", { use: useSpy })
    }));
    const { renderMarkdown } = await import("../src/markdown.js");
    await renderMarkdown("first call");
    await renderMarkdown("second call");
    // use() should only be called once (initialization is cached)
    expect(useSpy).toHaveBeenCalledTimes(1);
  });
});
