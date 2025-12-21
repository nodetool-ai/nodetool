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
import { Box, Dialog, IconButton, Tooltip } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { getShortcutTooltip } from "../config/shortcuts";

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
      height: "fit-content",
      padding: "0.25em 0.5em 2em 0.5em",
      fontSize: theme.vars.fontSizeBig,
      fontWeight: "300",
      lineHeight: "1.3",
      position: "relative"
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleClose = useCallback(() => {
    setSelectedNodeType(null);
  }, []);

  const isExternalLink = (url: string) => {
    return /^https?:\/\//.test(url);
  };

  const memoizedDocumentation = useMemo(() => {
    if (!selectedNodeType) {return null;}
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
        className="output markdown markdown-body"
        css={styles(theme)}
        ref={containerRef}
        tabIndex={0}
      >
        <Tooltip title="Enter fullscreen" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="fullscreen-button"
            aria-label="Enter fullscreen"
            onClick={() => setIsFullscreen(true)}
            size="small"
            sx={{
              position: "fixed",
              top: 8,
              right: 24,
              bgcolor: (t) => t.palette.action.hover,
              "&:hover": { bgcolor: (t) => t.palette.action.selected }
            }}
          >
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
          css={styles(theme)}
          sx={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
            marginBottom: "2em"
          }}
        >
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
                position: "fixed",
                top: 12,
                right: 16,
                zIndex: 1,
                bgcolor: (t) => t.palette.action.hover,
                "&:hover": { bgcolor: (t) => t.palette.action.selected }
              }}
            >
              <FullscreenExitIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
