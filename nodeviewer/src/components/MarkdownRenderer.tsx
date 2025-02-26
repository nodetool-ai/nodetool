/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface MarkdownRendererProps {
  content: string;
  isReadme?: boolean;
}

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      padding: "1em 1em 2em 1em",
    },
    p: {
      width: "100%",
    },
    pre: {
      width: "90%",
      overflow: "auto",
      backgroundColor: theme.palette.c_gray0,
      borderRadius: "5px",
      padding: "1em",
    },
    table: {
      maxWidth: "90%",
      overflow: "auto",
      display: "block",
      padding: "1em 0",
      borderCollapse: "collapse",
    },
    th: {
      border: `1px solid ${theme.palette.c_gray3}`,
      padding: "0.5em",
    },
    "li, ol": {
      paddingLeft: "1em",
    },
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isReadme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const isExternalLink = (url: string) => {
    return /^https?:\/\//.test(url);
  };

  return (
    <>
      <div
        className="output markdown"
        css={styles}
        ref={containerRef}
        tabIndex={0}
      >
        {isReadme ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              a: ({ href, children }) => {
                if (isExternalLink(href || "")) {
                  return <span>{children}</span>;
                }

                return <a href={href}>{children}</a>;
              },
            }}
          >
            {content || ""}
          </ReactMarkdown>
        ) : (
          <ReactMarkdown
            components={{
              a: ({ href, children }) => {
                return <a href={href}>{children}</a>;
              },
            }}
          >
            {content || ""}
          </ReactMarkdown>
        )}
      </div>
    </>
  );
};

export default MarkdownRenderer;
