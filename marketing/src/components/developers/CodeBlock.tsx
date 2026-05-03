"use client";
import React, { useMemo } from "react";

type Language = "typescript" | "bash";

interface CodeBlockProps {
  code: string;
  language?: Language;
  className?: string;
}

const TS_KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "var", "return", "async", "await",
  "class", "extends", "implements", "interface", "type", "enum", "static",
  "readonly", "declare", "function", "new", "if", "else", "for", "while", "of",
  "in", "do", "switch", "case", "break", "continue", "throw", "try", "catch",
  "finally", "default", "true", "false", "null", "undefined", "void", "this",
  "super", "as", "public", "private", "protected", "string", "number", "boolean",
  "any", "unknown", "never",
]);

const BASH_KEYWORDS = new Set([
  "cd", "ls", "echo", "export", "if", "then", "fi", "for", "do", "done", "while",
  "case", "esac", "in", "function", "return", "exit",
]);

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightTypescript(code: string): string {
  const tokens: Array<{ type: string; value: string }> = [];
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    const next2 = code.slice(i, i + 2);

    // Line comment
    if (next2 === "//") {
      let j = i;
      while (j < len && code[j] !== "\n") j++;
      tokens.push({ type: "comment", value: code.slice(i, j) });
      i = j;
      continue;
    }
    // Block comment
    if (next2 === "/*") {
      const end = code.indexOf("*/", i + 2);
      const j = end === -1 ? len : end + 2;
      tokens.push({ type: "comment", value: code.slice(i, j) });
      i = j;
      continue;
    }
    // Strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < len && code[j] !== quote) {
        if (code[j] === "\\") j += 2;
        else j++;
      }
      j = Math.min(j + 1, len);
      tokens.push({ type: "string", value: code.slice(i, j) });
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < len && /[0-9.]/.test(code[j])) j++;
      tokens.push({ type: "number", value: code.slice(i, j) });
      i = j;
      continue;
    }
    // Decorators
    if (ch === "@") {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(code[j])) j++;
      tokens.push({ type: "decorator", value: code.slice(i, j) });
      i = j;
      continue;
    }
    // Identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < len && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (TS_KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", value: word });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: "type", value: word });
      } else if (code[j] === "(") {
        tokens.push({ type: "fn", value: word });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }
    tokens.push({ type: "punct", value: ch });
    i++;
  }

  const colorFor: Record<string, string> = {
    comment: "text-slate-500 italic",
    string: "text-emerald-300",
    number: "text-amber-300",
    keyword: "text-violet-300",
    type: "text-sky-300",
    fn: "text-blue-300",
    decorator: "text-pink-300",
    ident: "text-slate-200",
    punct: "text-slate-400",
  };

  return tokens
    .map((t) => `<span class="${colorFor[t.type] ?? ""}">${escape(t.value)}</span>`)
    .join("");
}

function highlightBash(code: string): string {
  const lines = code.split("\n");
  return lines
    .map((line) => {
      // Comment
      const commentIdx = line.indexOf("#");
      let codePart = line;
      let commentPart = "";
      if (commentIdx >= 0) {
        codePart = line.slice(0, commentIdx);
        commentPart = line.slice(commentIdx);
      }

      const out: string[] = [];
      const re = /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\$[A-Za-z_][A-Za-z0-9_]*|\b[A-Za-z_][A-Za-z0-9_-]*\b|--?[A-Za-z][A-Za-z0-9-]*|\s+|[^\s])/g;
      let m: RegExpExecArray | null;
      let isFirstWord = true;
      while ((m = re.exec(codePart)) !== null) {
        const tok = m[0];
        if (/^\s+$/.test(tok)) {
          out.push(escape(tok));
          continue;
        }
        if (tok.startsWith('"') || tok.startsWith("'")) {
          out.push(`<span class="text-emerald-300">${escape(tok)}</span>`);
        } else if (tok.startsWith("$")) {
          out.push(`<span class="text-amber-300">${escape(tok)}</span>`);
        } else if (tok.startsWith("--") || tok.startsWith("-")) {
          out.push(`<span class="text-pink-300">${escape(tok)}</span>`);
        } else if (isFirstWord && /^[A-Za-z_]/.test(tok)) {
          out.push(
            BASH_KEYWORDS.has(tok)
              ? `<span class="text-violet-300">${escape(tok)}</span>`
              : `<span class="text-blue-300">${escape(tok)}</span>`
          );
        } else {
          out.push(`<span class="text-slate-200">${escape(tok)}</span>`);
        }
        if (!/^\s+$/.test(tok)) isFirstWord = false;
      }
      const codeHtml = out.join("");
      const commentHtml = commentPart
        ? `<span class="text-slate-500 italic">${escape(commentPart)}</span>`
        : "";
      return codeHtml + commentHtml;
    })
    .join("\n");
}

export default function CodeBlock({
  code,
  language = "typescript",
  className = "",
}: CodeBlockProps) {
  const html = useMemo(() => {
    if (language === "bash") return highlightBash(code);
    return highlightTypescript(code);
  }, [code, language]);

  return (
    <pre
      className={`rounded-lg bg-slate-950/90 p-4 text-xs overflow-x-auto font-mono border border-slate-800/60 leading-relaxed ${className}`}
    >
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
