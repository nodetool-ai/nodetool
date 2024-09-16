/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import DraggableNodeDocumentation from "../components/content/Help/DraggableNodeDocumentation";
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
      overflowY: "auto",
      padding: ".5em"
    },
    p: {
      fontFamily: theme.fontFamily1,
      width: "100%"
    },
    pre: {
      fontFamily: theme.fontFamily2,
      width: "90%",
      overflow: "auto",
      backgroundColor: theme.palette.c_gray0,
      borderRadius: "5px",
      padding: "1em"
    },
    table: {
      maxWidth: "90%",
      overflow: "auto",
      display: "block",
      padding: "1em 0",
      borderCollapse: "collapse"
    },
    th: {
      border: `1px solid ${theme.palette.c_gray3}`,
      padding: "0.5em"
    }
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isReadme
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [documentationPosition, setDocumentationPosition] = useState({
    x: 0,
    y: 0
  });

  const handleClose = useCallback(() => {
    setSelectedNodeType(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.target instanceof HTMLAnchorElement) {
      const url = new URL(e.target.href);
      setSelectedNodeType(url.pathname.split("/").pop() || "");
      setDocumentationPosition({ x: e.clientX + 200, y: e.clientY - 100 });
    }
  }, []);

  const isExternalLink = (url: string) => {
    return /^https?:\/\//.test(url);
  };

  const memoizedDocumentation = useMemo(() => {
    if (!selectedNodeType) return null;
    return createPortal(
      <DraggableNodeDocumentation
        nodeType={selectedNodeType}
        position={documentationPosition}
        onClose={handleClose}
      />,
      document.body
    );
  }, [selectedNodeType, documentationPosition, handleClose]);

  return (
    <>
      <div
        className="output markdown"
        css={styles}
        ref={containerRef}
        tabIndex={0}
        onClick={handleClick}
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
              }
            }}
          >
            {content || ""}
          </ReactMarkdown>
        ) : (
          <ReactMarkdown>{content || ""}</ReactMarkdown>
        )}
      </div>
      {memoizedDocumentation}
    </>
  );
};

export default MarkdownRenderer;
