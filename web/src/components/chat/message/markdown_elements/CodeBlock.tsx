/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo } from "react";
import {
  oneDark,
  oneLight
} from "react-syntax-highlighter/dist/esm/styles/prism";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { CopyButton, BORDER_RADIUS, FONT_SIZE_SANS, SPACING, getSpacingPx } from "../../../ui_primitives";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";
import isEqual from "fast-deep-equal";

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

const customBlockStyle: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  marginTop: 0,
  padding: "1em",
  margin: 0,
  border: "2px solid var(--palette-grey-800)",
  boxSizing: "border-box",
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: BORDER_RADIUS.sm,
  borderBottomRightRadius: BORDER_RADIUS.sm
};

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

  const language = match ? match[1] : "plaintext";
  const customizedTheme = useMemo(() => {
    const codeTheme = isDarkMode ? oneDark : oneLight;
    return {
      ...codeTheme,
      'pre[class*="language-"]': {
        ...codeTheme['pre[class*="language-"]'],
        margin: 0,
        borderRadius: 0
      }
    };
  }, [isDarkMode]);

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
        <SyntaxHighlighter
          className="code-block-content"
          style={customizedTheme}
          language={language}
          PreTag="div"
          customStyle={customBlockStyle}
          {...props}
        >
          {codeContent}
        </SyntaxHighlighter>
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
