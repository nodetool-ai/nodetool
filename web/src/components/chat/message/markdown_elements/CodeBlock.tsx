/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo } from "react";
import Prism from "prismjs";
import "../../../../prismGlobal";
import DOMPurify from "dompurify";
import {
  CopyButton,
  BORDER_RADIUS,
  FlexRow,
  FONT_SIZE_MONO,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  SPACING,
  getSpacingPx
} from "../../../ui_primitives";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";
import {
  CodeThemeColors,
  oneDarkColors,
  oneLightColors
} from "./codeBlockColors";
import isEqual from "../../../../utils/isEqual";
import { isString } from "../../../../utils/typePredicates";

export interface CodeBlockProps
  extends React.ComponentPropsWithoutRef<"code"> {
  node?: unknown;
  inline?: boolean;
  _isFromPre?: boolean;
  onInsert?: (text: string, language?: string) => void;
}

const cssStyles = css({
  minWidth: 0,
  maxWidth: "100%",
  ".code-block-header": {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: getSpacingPx(SPACING.md),
    backgroundColor: "var(--palette-grey-800)",
    color: "var(--palette-text-primary)",
    paddingTop: getSpacingPx(SPACING.sm),
    paddingBottom: getSpacingPx(SPACING.sm),
    paddingLeft: getSpacingPx(SPACING.xl),
    paddingRight: getSpacingPx(SPACING.xl),
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderTopRightRadius: BORDER_RADIUS.md
  },
  ".code-block-language": {
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.caption,
    color: "var(--palette-text-secondary)",
    textTransform: "lowercase"
  }
});

const contentStyles = (colors: CodeThemeColors) =>
  css({
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.code,
    padding: getSpacingPx(SPACING.xl),
    margin: 0,
    border: "1px solid var(--palette-grey-800)",
    boxSizing: "border-box",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    backgroundColor: colors.background,
    color: colors.foreground,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    overflow: "auto",
    maxHeight: "40vh",
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

const svgPreviewStyles = css({
  padding: getSpacingPx(SPACING.xl),
  margin: 0,
  border: "1px solid var(--palette-grey-800)",
  boxSizing: "border-box",
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: BORDER_RADIUS.md,
  borderBottomRightRadius: BORDER_RADIUS.md,
  backgroundColor: "var(--palette-background-paper)",
  overflow: "visible",
  "& svg": {
    display: "block",
    width: "100%",
    height: "auto",
    maxWidth: "100%"
  }
});

/** Languages that may carry a whole SVG document as the block body. */
const SVG_BLOCK_LANGUAGES = new Set(["svg", "xml", "html", "plaintext"]);

/**
 * Returns the `<svg>…</svg>` document when the block body is an SVG,
 * after stripping a BOM, XML declaration, or SVG doctype. Returns null
 * when the block is not an SVG document.
 */
export function extractSvgDocument(source: string): string | null {
  const trimmed = source.trim().replace(/^\uFEFF/, "");
  if (!trimmed) {
    return null;
  }
  const body = trimmed
    .replace(/^<\?xml\b[\s\S]*?\?>\s*/i, "")
    .replace(/^<!DOCTYPE\s+svg\b[\s\S]*?>\s*/i, "");
  if (!/^<svg(\s|>|\/)/i.test(body)) {
    return null;
  }
  return body;
}

function parseSvgLength(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || /[%a-z]/i.test(trimmed.replace(/px$/i, ""))) {
    return null;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ViewBox-only SVGs default to 300×150 as a replaced element, which clips
 * tall drawings. Pin width to the column and set aspect-ratio from the
 * document so the frame is as tall as the graphic.
 */
function sizeSvgToFrame(clean: string): string {
  if (typeof DOMParser === "undefined") {
    return clean;
  }
  const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.localName.toLowerCase() !== "svg") {
    return clean;
  }
  if (svg.getElementsByTagName("parsererror").length > 0) {
    return clean;
  }

  let width = parseSvgLength(svg.getAttribute("width"));
  let height = parseSvgLength(svg.getAttribute("height"));
  const parts = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).filter(Boolean);
  if (parts && parts.length === 4) {
    const viewWidth = parseFloat(parts[2]);
    const viewHeight = parseFloat(parts[3]);
    if (viewWidth > 0 && viewHeight > 0 && !(width && height)) {
      width = viewWidth;
      height = viewHeight;
    }
  }
  if (!width || !height) {
    return clean;
  }

  svg.removeAttribute("width");
  svg.removeAttribute("height");
  const frameStyle = `width:100%;height:auto;aspect-ratio:${width} / ${height}`;
  const prior = svg.getAttribute("style")?.trim() ?? "";
  svg.setAttribute(
    "style",
    prior ? `${prior}${prior.endsWith(";") ? "" : ";"}${frameStyle}` : frameStyle
  );
  return new XMLSerializer().serializeToString(svg);
}

function sanitizeSvgDocument(source: string): string | null {
  const extracted = extractSvgDocument(source);
  if (!extracted) {
    return null;
  }
  const clean = DOMPurify.sanitize(extracted, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
    KEEP_CONTENT: false
  });
  if (!isString(clean) || !/<svg(\s|>|\/)/i.test(clean)) {
    return null;
  }
  return sizeSvgToFrame(clean);
}

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
    if (onInsert != null) {
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

  const svgMarkup = useMemo(() => {
    if (!renderAsBlock || !SVG_BLOCK_LANGUAGES.has(language)) {
      return null;
    }
    return sanitizeSvgDocument(codeContent);
  }, [renderAsBlock, language, codeContent]);

  const highlightedHtml = useMemo(() => {
    if (!renderAsBlock || svgMarkup) {
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
  }, [renderAsBlock, svgMarkup, language, codeContent]);

  if (renderAsBlock) {
    return (
      <div css={cssStyles} className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-language">{match ? match[1] : ""}</span>
          <FlexRow gap={SPACING.md} align="center">
            {onInsert != null && (
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
          </FlexRow>
        </div>
        {svgMarkup ? (
          <div
            className="svg-preview"
            css={svgPreviewStyles}
            data-testid="svg-preview"
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
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
        )}
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
