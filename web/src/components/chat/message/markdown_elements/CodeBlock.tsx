/** @jsxImportSource @emotion/react */
import React from "react";
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { CopyToClipboardButton } from "../../../common/CopyToClipboardButton";

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  node,
  inline,
  className,
  children,
  ...props
}) => {
  const codeContent = String(children).trimEnd();
  const match = /language-(\w+)/.exec(className || "");

  let renderAsBlock = false;

  if (inline === false) {
    renderAsBlock = true;
  } else if (inline === undefined) {
    if (node?.parent?.tagName === "pre" || match != null) {
      renderAsBlock = true;
    }
  }

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
      <div style={{ position: "relative" }}>
        <div className="code-block-header">
          <span>{match ? match[1] : ""}</span>
          <CopyToClipboardButton textToCopy={codeContent} />
        </div>
        <SyntaxHighlighter
          style={customizedOkaidia}
          language={language}
          PreTag="div"
          customStyle={{
            background: "transparent",
            fontFamily: '"JetBrains Mono", monospace',
            marginTop: 0,
            padding: 0,
            margin: 0,
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
