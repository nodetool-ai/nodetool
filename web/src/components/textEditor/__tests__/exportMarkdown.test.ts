/**
 * Regression guards for markdown import/export — the path used by
 * {@link copyAsMarkdown} (the editor "copy as markdown" action) and by
 * `CommentNode`, which seeds its editor from a markdown string via
 * `$convertFromMarkdownString`. The 0.45 release touched markdown shortcuts and
 * round-tripping, so pin that the common constructs survive a round-trip with
 * the exact `TRANSFORMERS` set the app passes.
 */
import { createEditor, $getRoot, type LexicalEditor } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";

import { copyAsMarkdown } from "../exportMarkdown";

const makeEditor = (): LexicalEditor =>
  createEditor({
    namespace: "markdown-test",
    // Mirror the node set registered by CommentNode's editor config.
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
    onError: (e) => {
      throw e;
    }
  });

const roundTrip = (markdown: string): string => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(markdown, TRANSFORMERS);
    },
    { discrete: true }
  );
  let out = "";
  editor.getEditorState().read(() => {
    out = $convertToMarkdownString(TRANSFORMERS);
  });
  return out;
};

describe("markdown round-trip (TRANSFORMERS)", () => {
  it.each([
    ["heading", "# Heading 1"],
    ["bold and italic", "**bold** and *italic*"],
    ["unordered list", "- one\n- two"],
    ["ordered list", "1. first\n2. second"],
    ["blockquote", "> a quote"],
    ["inline code", "Use `code` inline"],
    ["link", "[link](https://example.com)"],
    ["fenced code block", "```\ncode block\n```"]
  ])("preserves %s through import → export", (_label, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });
});

describe("copyAsMarkdown", () => {
  it("writes the editor content as markdown to the clipboard", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    const editor = makeEditor();
    editor.update(
      () => {
        $getRoot().clear();
        $convertFromMarkdownString("# Title\n\nsome **bold** text", TRANSFORMERS);
      },
      { discrete: true }
    );

    const ok = await copyAsMarkdown(editor);

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("# Title\n\nsome **bold** text");
  });

  it("returns false when the clipboard write fails", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const ok = await copyAsMarkdown(makeEditor());

    expect(ok).toBe(false);
    consoleError.mockRestore();
  });
});
