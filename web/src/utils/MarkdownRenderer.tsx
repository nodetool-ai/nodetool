/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import DraggableNodeDocumentation from "../components/content/Help/DraggableNodeDocumentation";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Dialog, IconButton, Tooltip } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { getShortcutTooltip } from "../config/shortcuts";
import { CopyToClipboardButton } from "../components/common/CopyToClipboardButton";

interface MarkdownRendererProps {
  content: string;
  isReadme?: boolean;
}

const styles = (
  theme: Theme,
  opts: { constrainHeight: boolean; isScrollable: boolean; fontSize?: string }
) =>
  css({
    "&": {
      cursor: "text",
      userSelect: "text",
      width: "100%",
      height: "fit-content",
      padding: "0.25em 0.5em 2em 0.5em",
      fontSize: opts.fontSize ?? theme.vars.fontSizeBig,
      fontWeight: "300",
      lineHeight: "1.3",
      position: "relative",
      ...(opts.constrainHeight
        ? {
            maxHeight: "min(32vh, 320px)",
            overflowY: opts.isScrollable ? "auto" : "hidden",
            overflowX: "hidden",
            scrollbarGutter: opts.isScrollable ? "stable" : "auto"
          }
        : {
            maxHeight: "none",
            overflow: "auto"
          })
    },
    ".markdown-output-actions": {
      position: "absolute",
      top: 2,
      right: 2,
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 4,
      padding: 2,
      zIndex: 2,
      borderRadius: 6,
      backgroundColor: "rgba(0,0,0,0.35)",
      backdropFilter: "blur(6px)"
    }
  });

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isReadme
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const documentationPosition = useMemo(() => ({ x: 0, y: 0 }), []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleClose = useCallback(() => {
    setSelectedNodeType(null);
  }, []);

  const isExternalLink = (url: string) => {
    return /^https?:\/\//.test(url);
  };

  const memoizedDocumentation = useMemo(() => {
    if (!selectedNodeType) {
      return null;
    }
    return createPortal(
      <DraggableNodeDocumentation
        nodeType={selectedNodeType}
        position={documentationPosition}
        onClose={handleClose}
      />,
      document.body
    );
  }, [selectedNodeType, documentationPosition, handleClose]);

  const baseFontSize = isReadme ? undefined : "inherit";

  return (
    <>
      <div
        className={`output markdown markdown-body ${
          isFocused ? "nowheel" : ""
        }`}
        css={styles(theme, {
          constrainHeight: true,
          isScrollable: isFocused,
          fontSize: baseFontSize
        })}
        ref={containerRef}
        tabIndex={0}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.contains(next)) {
            setIsFocused(false);
          }
        }}
        onWheelCapture={(e) => {
          // Only capture wheel when focused; otherwise let ReactFlow zoom/pan.
          if (isFocused) {
            e.stopPropagation();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {(isHovered || Boolean(isReadme)) && (
          <div className="markdown-output-actions">
            <CopyToClipboardButton copyValue={content ?? ""} size="small" />
            <Tooltip title="Enter fullscreen" enterDelay={TOOLTIP_ENTER_DELAY}>
              <IconButton
                className="fullscreen-button"
                aria-label="Enter fullscreen"
                onClick={() => setIsFullscreen(true)}
                size="small"
                sx={{
                  bgcolor: (t) => t.palette.action.hover,
                  "&:hover": { bgcolor: (t) => t.palette.action.selected }
                }}
              >
                <FullscreenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        )}
        <Box>
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
        </Box>
      </div>

      <Dialog
        fullScreen
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        slotProps={{
          paper: {
            sx: {
              p: "1em",
              bgcolor: theme.vars.palette.background.default,
              backgroundImage: "none",
              opacity: 1
            }
          }
        }}
      >
        <Box
          className="output markdown markdown-body"
          css={styles(theme, {
            constrainHeight: false,
            isScrollable: true,
            fontSize: baseFontSize
          })}
          sx={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
            marginBottom: "2em"
          }}
        >
          <div className="markdown-output-actions">
            <CopyToClipboardButton
              copyValue={content ?? ""}
              size="small"
              tooltipPlacement="bottom"
            />
            <Tooltip
              title={getShortcutTooltip("exitFullscreen")}
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <IconButton
                className="fullscreen-exit-button"
                aria-label="Exit fullscreen"
                onClick={() => setIsFullscreen(false)}
                size="small"
                sx={{
                  bgcolor: (t) => t.palette.action.hover,
                  "&:hover": { bgcolor: (t) => t.palette.action.selected }
                }}
              >
                <FullscreenExitIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
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
        </Box>
      </Dialog>
      {memoizedDocumentation}
    </>
  );
};

export default MarkdownRenderer;
