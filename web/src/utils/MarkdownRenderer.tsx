/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useRef } from "react";
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
      fontFamily: theme.fontFamily1,
      width: "100%"
    },
    pre: {
      fontFamily: theme.fontFamily2,
      width: "100%"
    }
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "a") {
        event.preventDefault();
        if (containerRef.current) {
          const range = document.createRange();
          range.selectNodeContents(containerRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
    };

    const container = containerRef.current;
    container?.addEventListener("keydown", handleKeyDown);

    return () => {
      container?.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="output markdown"
      css={styles}
      ref={containerRef}
      tabIndex={0}
    >
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
