/**
 * LaTeX math in chat replies.
 *
 * Models write math three ways: `$$…$$`, `\(…\)` inline and `\[…\]` as a
 * block. remark-math reads only dollar delimiters, so the bracket forms are
 * rewritten first. Single-dollar math stays off: "$5 and $10" is a price far
 * more often than an equation. A double-dollar span inside a sentence still
 * renders inline.
 *
 * The parser and KaTeX load on first use, so a conversation without math
 * never downloads them.
 */
import type { Options } from "react-markdown";

/** Cheap test for whether a message could hold math at all. */
export const mayContainMath = (content: string): boolean =>
  content.includes("$$") || content.includes("\\(") || content.includes("\\[");

/** Code spans and fences, which keep their backslashes and dollars as written. */
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g;

/**
 * Rewrite `\(…\)` and `\[…\]` to dollar delimiters outside code, and put
 * the delimiters of a one-line `$$…$$` equation on their own lines.
 */
export const normalizeMathDelimiters = (content: string): string =>
  content
    .split(CODE)
    .map((part, index) => {
      // `split` with a capture group puts the code at odd indices.
      if (index % 2 === 1) {
        return part;
      }
      return part
        // `$$…$$` alone on its line is a display equation, as every chat
        // client renders it; remark-math reads it as inline unless the
        // delimiters sit on their own lines.
        .replace(
          /^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm,
          (_match, body: string) => `$$\n${body.trim()}\n$$`
        )
        .replace(/\\\[([\s\S]+?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$$${body.trim()}$$`);
    })
    .join("");

export interface MathPlugins {
  remark: NonNullable<Options["remarkPlugins"]>[number];
  rehype: NonNullable<Options["rehypePlugins"]>[number];
}

let loading: Promise<MathPlugins> | null = null;

/** Load remark-math, rehype-katex and the KaTeX stylesheet once. */
export const loadMathPlugins = (): Promise<MathPlugins> => {
  loading ??= Promise.all([
    import("remark-math"),
    import("rehype-katex"),
    import("katex/dist/katex.min.css")
  ]).then(([remarkMath, rehypeKatex]) => ({
    remark: [remarkMath.default, { singleDollarTextMath: false }],
    rehype: [rehypeKatex.default, { throwOnError: false, strict: "ignore" }]
  }));
  return loading;
};
