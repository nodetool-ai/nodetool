/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback } from "react";
import {
  oneDark,
  oneLight
} from "react-syntax-highlighter/dist/esm/styles/prism";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { CopyToClipboardButton } from "../../../common/CopyToClipboardButton";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  _isFromPre?: boolean;
  onInsert?: (text: string, language?: string) => void;
  [key: string]: any;
}

const styles = (theme: Theme) =>
  css({
    ".code-block-header": {
      padding: ".5em 1em"
    }
  });

export const CodeBlock: React.FC<CodeBlockProps> = ({
  node,
  inline,
  className,
  children,
  _isFromPre,
  ...props
}) => {
  const theme = useTheme();
  const codeContent = String(children).trimEnd();
  const match = /language-(\w+)/.exec(className || "");
  const isDarkMode = useIsDarkMode();
  const handleInsert = useCallback(() => {
    if (typeof props.onInsert === "function") {
      const language = match ? match[1] : undefined;
      props.onInsert(codeContent, language);
    }
  }, [props, codeContent, match]);

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
    const codeTheme = isDarkMode ? oneDark : oneLight;
    const customizedTheme = {
      ...codeTheme,
      'pre[class*="language-"]': {
        ...codeTheme['pre[class*="language-"]'],
        margin: 0,
        borderRadius: 0
      }
    };

    return (
      <div css={styles(theme)} className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-language">{match ? match[1] : ""}</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {typeof props.onInsert === "function" && (
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
            <CopyToClipboardButton textToCopy={codeContent} />
          </div>
        </div>
        <SyntaxHighlighter
          className="code-block-content"
          style={customizedTheme}
          language={language}
          PreTag="div"
          customStyle={{
            // background: "var(--palette-grey-900)",
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
};
