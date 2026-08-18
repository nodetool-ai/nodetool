import { describe, expect, it } from "vitest";

import { escapeHtml, markdownToTelegramHtml } from "../src/markdown-html.js";

function html(markdown: string): string {
  const result = markdownToTelegramHtml(markdown);
  if (!result.ok) {
    throw new Error(`expected a conversion, got the plain-text fallback: ${result.text}`);
  }
  return result.html;
}

describe("escapeHtml", () => {
  it("escapes exactly the three reserved characters", () => {
    expect(escapeHtml(`a & b < c > d " e '`)).toBe(`a &amp; b &lt; c &gt; d " e '`);
  });

  it("escapes the ampersand before the angle brackets", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("markdownToTelegramHtml", () => {
  it("converts bold, italic and inline code", () => {
    expect(html("**bold** and *italic* and `code`")).toBe(
      "<b>bold</b> and <i>italic</i> and <code>code</code>"
    );
    expect(html("__bold__ and _italic_")).toBe("<b>bold</b> and <i>italic</i>");
  });

  it("nests italic inside bold", () => {
    expect(html("**outer *inner* rest**")).toBe("<b>outer <i>inner</i> rest</b>");
  });

  it("escapes reserved characters in prose", () => {
    expect(html("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
  });

  it("escapes reserved characters inside inline code", () => {
    expect(html("use `a <b> & c`")).toBe("use <code>a &lt;b&gt; &amp; c</code>");
  });

  it("converts a fenced code block, carrying the language", () => {
    expect(html("```ts\nconst a = 1 < 2;\n```")).toBe(
      '<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>'
    );
    expect(html("```\nplain\n```")).toBe("<pre><code>plain</code></pre>");
  });

  it("leaves markdown inside a code block untouched", () => {
    expect(html("```\n**not bold**\n```")).toBe("<pre><code>**not bold**</code></pre>");
  });

  it("converts links, including a URL with parentheses", () => {
    expect(html("[docs](https://nodetool.ai/a)")).toBe(
      '<a href="https://nodetool.ai/a">docs</a>'
    );
    expect(html("[wiki](https://en.wikipedia.org/wiki/Foo_(bar))")).toBe(
      '<a href="https://en.wikipedia.org/wiki/Foo_(bar)">wiki</a>'
    );
  });

  it("escapes reserved characters in a link's href and label", () => {
    expect(html("[a & b](https://x.test/?q=1&r=2)")).toBe(
      '<a href="https://x.test/?q=1&amp;r=2">a &amp; b</a>'
    );
  });

  it("renders an unsafe link scheme as plain text", () => {
    expect(html("[click](javascript:alert(1))")).toBe("[click](javascript:alert(1))");
  });

  it("leaves snake_case identifiers alone", () => {
    expect(html("call tool_call_update now")).toBe("call tool_call_update now");
  });

  it("treats an unmatched marker as a literal", () => {
    expect(html("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(html("a `dangling backtick")).toBe("a `dangling backtick");
  });

  it("falls back to plain text on an unbalanced fence", () => {
    const source = "here you go:\n```ts\nconst a = 1;\n";
    const result = markdownToTelegramHtml(source);
    expect(result).toEqual({ ok: false, text: source });
  });

  it("never emits an unbalanced tag", () => {
    const samples = [
      "**a *b** c*",
      "`a` **b _c_** [d](https://x.test)",
      "```\n<pre>\n```",
      "<b>literal angle brackets</b>",
      "***",
      "____"
    ];
    for (const sample of samples) {
      const result = markdownToTelegramHtml(sample);
      if (!result.ok) {
        continue;
      }
      const stack: string[] = [];
      for (const match of result.html.matchAll(/<(\/?)([a-z]+)(?:\s[^<>]*)?>/g)) {
        if (match[1] === "/") {
          expect(stack.pop()).toBe(match[2]);
        } else {
          stack.push(match[2]);
        }
      }
      expect(stack).toEqual([]);
    }
  });

  it("keeps prose and code blocks in order", () => {
    expect(html("intro\n\n```\nbody\n```\n\noutro")).toBe(
      "intro\n\n<pre><code>body</code></pre>\n\noutro"
    );
  });
});

describe("adversarial input (CodeQL js/polynomial-redos regressions)", () => {
  it("handles a fence-like line with a long space run in linear time", () => {
    // The old FENCE_LINE regex (`…\s*([^\s`~]*)\s*$`) was quadratic on
    // exactly this shape — a space run followed by a character the info
    // token cannot contain (measured ~1.8 s at 40k spaces; 200k would hang).
    const md = "```" + " ".repeat(200_000) + "`\nprose";
    const result = markdownToTelegramHtml(md);
    expect(result.ok).toBe(true);
  });

  it("still refuses a fence info string with inner whitespace", () => {
    const result = markdownToTelegramHtml("``` foo bar\ntext");
    // Not a fence, so no unclosed block: the line is prose.
    expect(result.ok).toBe(true);
  });
});
