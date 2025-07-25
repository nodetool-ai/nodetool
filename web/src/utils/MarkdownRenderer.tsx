/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import DraggableNodeDocumentation from "../components/content/Help/DraggableNodeDocumentation";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { usePanelStore } from "../stores/PanelStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface MarkdownRendererProps {
  content: string;
  isReadme?: boolean;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      cursor: "text",
      userSelect: "text",
      width: "100%",
      height: "100%",
      padding: "1em 1em 2em 1em",
      fontWeight: "300"
    },
    p: {
      width: "100%",
      lineHeight: "1.2em",
      margin: "0.25em 0 .75em 0"
    },
    strong: {
      fontWeight: "600"
    },
    pre: {
      width: "90%",
      overflow: "auto",
      backgroundColor: theme.vars.palette.grey[900],
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
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      padding: "0.5em"
    },
    "li, ol": {
      paddingLeft: "1em",
      marginBottom: "0.5em"
    },
    ".markdown": {
      padding: "1em"
    }
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isReadme
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const { panel } = usePanelStore();
  const [documentationPosition, setDocumentationPosition] = useState({
    x: 0,
    y: 0
  });

  const handleClose = useCallback(() => {
    setSelectedNodeType(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (e.target instanceof HTMLAnchorElement) {
        const url = new URL(e.target.href);
        setSelectedNodeType(url.pathname.split("/").pop() || "");
        setDocumentationPosition({
          x: e.clientX + panel.panelSize,
          y: e.clientY - 150
        });
      }
    },
    [panel.panelSize]
  );

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
        className="output markdown nodrag noscroll"
        css={styles(theme)}
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
              }
            }}
          >
            {content || ""}
          </ReactMarkdown>
        ) : (
          <ReactMarkdown
            components={{
              a: ({ href, children }) => {
                return (
                  <a href={href} onClick={handleClick}>
                    {children}
                  </a>
                );
              }
            }}
          >
            {content || ""}
          </ReactMarkdown>
        )}
      </div>
      {memoizedDocumentation}
    </>
  );
};

export default MarkdownRenderer;
