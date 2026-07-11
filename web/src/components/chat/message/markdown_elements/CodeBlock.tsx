/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo } from "react";
import Prism from "prismjs";
import "../../../../prismGlobal";
import DOMPurify from "dompurify";
import { CopyButton, BORDER_RADIUS, FONT_SIZE_SANS, FONT_WEIGHT, SPACING, getSpacingPx } from "../../../ui_primitives";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";
import {
  CodeThemeColors,
  oneDarkColors,
  oneLightColors
} from "./codeBlockColors";
import isEqual from "../../../../utils/isEqual";

interface CodeBlockProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  _isFromPre?: boolean;
  onInsert?: (text: string, language?: string) => void;
  [key: string]: unknown;
}

const cssStyles = css({
  ".code-block-header": {
    padding: ".5em 1em"
  }
});

const contentStyles = (colors: CodeThemeColors) =>
  css({
    fontFamily: '"JetBrains Mono", monospace',
    padding: "1em",
    margin: 0,
    border: "2px solid var(--palette-grey-800)",
    boxSizing: "border-box",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: BORDER_RADIUS.sm,
    borderBottomRightRadius: BORDER_RADIUS.sm,
    backgroundColor: colors.background,
    color: colors.foreground,
    whiteSpace: "pre",
    wordBreak: "normal",
    overflow: "auto",
    lineHeight: 1.5,
    tabSize: 2,
    "& code": {
      fontFamily: "inherit",
      background: "none",
      color: "inherit"
    },
    ".token.comment, .token.prolog, .token.cdata": {
      color: colors.comment,
      fontStyle: "italic"
    },
    ".token.doctype, .token.punctuation, .token.entity": {
      color: colors.foreground
    },
    ".token.keyword, .token.atrule": {
      color: colors.keyword
    },
    ".token.property, .token.tag, .token.symbol, .token.deleted, .token.important":
      {
        color: colors.tag
      },
    ".token.selector, .token.string, .token.char, .token.builtin, .token.inserted, .token.regex, .token.attr-value":
      {
        color: colors.string
      },
    ".token.attr-name, .token.class-name, .token.boolean, .token.constant, .token.number":
      {
        color: colors.number
      },
    ".token.variable, .token.operator, .token.function": {
      color: colors.function
    },
    ".token.url": {
      color: colors.url
    },
    ".token.bold": {
      fontWeight: FONT_WEIGHT.semibold
    },
    ".token.italic": {
      fontStyle: "italic"
    }
  });

const darkContentStyles = contentStyles(oneDarkColors);
const lightContentStyles = contentStyles(oneLightColors);

export const CodeBlock: React.FC<CodeBlockProps> = memo(({
  node: _node,
  inline,
  className,
  children,
  _isFromPre,
  onInsert,
  ...props
}) => {
  const codeContent = String(children).trimEnd();
  const match = /language-(\w+)/.exec(className || "");
  const isDarkMode = useIsDarkMode();
  const handleInsert = useCallback(() => {
    if (typeof onInsert === "function") {
      const language = match ? match[1] : undefined;
      onInsert(codeContent, language);
    }
  }, [onInsert, codeContent, match]);

  let renderAsBlock = false;

  if (inline === false) {
    // This is a Markdown fenced code block. ReactMarkdown sets inline:false.
    renderAsBlock = true;
  } else if (_isFromPre === true) {
    // Code block explicitly signaled by our custom PreRenderer
    renderAsBlock = true;
  } else if (inline === undefined && match != null) {
    // Standalone HTML <code> tag with a language class, not inside a <pre>
    // (e.g., <code class="language-js">...</code> in raw HTML)
    renderAsBlock = true;
  }
  // If inline === true (Markdown `inline code`), renderAsBlock remains false.

  // Prism grammar keys are lowercase; normalize so `language-JS` still
  // highlights. The header keeps displaying the original casing.
  const language = (match ? match[1] : "plaintext").toLowerCase();

  const highlightedHtml = useMemo(() => {
    if (!renderAsBlock) {
      return null;
    }
    const grammar = Prism.languages[language];
    if (!grammar) {
      return null;
    }
    try {
      return DOMPurify.sanitize(
        Prism.highlight(codeContent, grammar, language)
      );
    } catch {
      // Prism highlighting failed — fall back to plain text
      return null;
    }
  }, [renderAsBlock, language, codeContent]);

  if (renderAsBlock) {
    return (
      <div css={cssStyles} className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-language">{match ? match[1] : ""}</span>
          <div style={{ display: "flex", gap: getSpacingPx(SPACING.md), alignItems: "center" }}>
            {typeof onInsert === "function" && (
              <button
                type="button"
                className="button"
                onClick={handleInsert}
                title="Insert into editor"
                style={{
                  padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
                  fontSize: FONT_SIZE_SANS.caption,
                  borderRadius: BORDER_RADIUS.xs,
                  border: "1px solid var(--palette-grey-700)",
                  background: "var(--palette-grey-700)",
                  color: "var(--palette-grey-50)",
                  cursor: "pointer"
                }}
              >
                Insert into editor
              </button>
            )}
            <CopyButton value={codeContent} />
          </div>
        </div>
        <div
          className="code-block-content"
          css={isDarkMode ? darkContentStyles : lightContentStyles}
          {...props}
        >
          {highlightedHtml !== null ? (
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <code className={`language-${language}`}>{codeContent}</code>
          )}
        </div>
      </div>
    );
  } else {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
}, isEqual);

CodeBlock.displayName = "CodeBlock";
