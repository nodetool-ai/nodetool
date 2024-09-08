/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import DraggableNodeDocumentation from "../components/content/Help/DraggableNodeDocumentation";

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
        <ReactMarkdown>{content || ""}</ReactMarkdown>
      </div>
      {memoizedDocumentation}
    </>
  );
};

export default MarkdownRenderer;
