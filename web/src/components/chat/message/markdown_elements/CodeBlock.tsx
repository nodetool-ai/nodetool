/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useMemo, memo } from "react";
import {
  oneDark,
  oneLight
} from "react-syntax-highlighter/dist/esm/styles/prism";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { CopyButton } from "../../../ui_primitives/CopyButton";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";

interface CodeBlockProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  _isFromPre?: boolean;
  onInsert?: (text: string, language?: string) => void;
  [key: string]: unknown;
}

const styles = (_theme: Theme) =>
  css({
    ".code-block-header": {
      padding: ".5em 1em"
    }
  });

export const CodeBlock: React.FC<CodeBlockProps> = memo(({
  node,
  inline,
  className,
  children,
  _isFromPre,
  onInsert,
  ...props
}) => {
  const _theme = useTheme();
  const codeContent = String(children).trimEnd();
  const match = /language-(\w+)/.exec(className || "");
  const isDarkMode = useIsDarkMode();
  const handleInsert = useCallback(() => {
    if (typeof onInsert === "function") {
      const language = match ? match[1] : undefined;
      onInsert(codeContent, language);
    }
  }, [onInsert, codeContent, match]);

  // Memoize theme customization to avoid recreating on every render
  // Must be called before any conditional returns
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

  if (renderAsBlock) {
    const language = match ? match[1] : "plaintext";

    return (
      <div css={styles(_theme)} className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-language">{match ? match[1] : ""}</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {typeof onInsert === "function" && (
              <button
                className="button"
                onClick={handleInsert}
                title="Insert into editor"
                style={{
                  padding: "6px 10px",
                  fontSize: "var(--fontSizeSmaller)",
                  borderRadius: "4px",
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
          customStyle={{
            fontFamily: '"JetBrains Mono", monospace',
            marginTop: 0,
            padding: "1em",
            margin: 0,
            border: "2px solid var(--palette-grey-800)",
            boxSizing: "border-box",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: "8px",
            borderBottomRightRadius: "8px"
          }}
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
}, (prevProps, nextProps) => {
  // Only re-render if children, className, or inline changes
  return (
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className &&
    prevProps.inline === nextProps.inline &&
    prevProps._isFromPre === nextProps._isFromPre
  );
});

CodeBlock.displayName = "CodeBlock";
