/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { CopyToClipboardButton } from "../../../common/CopyToClipboardButton";

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  _isFromPre?: boolean;
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
    const customizedOkaidia = {
      ...okaidia,
      'pre[class*="language-"]': {
        ...okaidia['pre[class*="language-"]'],
        margin: 0,
        borderRadius: 0
      }
    };

    return (
      <div css={styles(theme)} className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-language">{match ? match[1] : ""}</span>
          <CopyToClipboardButton textToCopy={codeContent} />
        </div>
        <SyntaxHighlighter
          className="code-block-content"
          style={customizedOkaidia}
          language={language}
          PreTag="div"
          customStyle={{
            background: "var(--palette-grey-900)",
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
