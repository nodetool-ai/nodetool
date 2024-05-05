/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownRendererProps {
  content: string;
}

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      overflowY: "auto",
      padding: ".5em"
    },
    p: {
      fontFamily: theme.fontFamily1
    },
    pre: {
      fontFamily: theme.fontFamily2
    }
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="output markdown" css={styles}>
      <ReactMarkdown
        components={{
          a: ({ node, href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
