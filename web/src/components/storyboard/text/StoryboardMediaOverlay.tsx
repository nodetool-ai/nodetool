/**
 * Thumbnails of the selected stills, drawn under their `![Still](…)` lines.
 *
 * Lexical owns the line elements, so the images cannot live inside them. The
 * still lines reserve the space (`STILL_THUMB_HEIGHT` in the editor styles)
 * and this layer, absolutely positioned over the editor, draws each image into
 * that space. It is measured again after every editor update and resize.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useTheme } from "@mui/material/styles";
import type { StoryboardMarkdownResult } from "@nodetool-ai/protocol";

import { Box, ResponsiveImage, BORDER_RADIUS } from "../../ui_primitives";
import { STILL_THUMB_HEIGHT, STILL_THUMB_WIDTH } from "./storyboardTextStyles";

interface StoryboardMediaOverlayProps {
  result: StoryboardMarkdownResult | null;
}

interface Placed {
  line: number;
  uri: string;
  shot: number;
  top: number;
  left: number;
}

const StoryboardMediaOverlay: React.FC<StoryboardMediaOverlayProps> = ({ result }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [editor] = useLexicalComposerContext();
  const [placed, setPlaced] = useState<Placed[]>([]);

  useEffect(() => {
    const root = editor.getRootElement();
    const host = root?.parentElement;
    if (!root || !host || !result) {
      setPlaced([]);
      return;
    }
    const measure = (): void => {
      const hostRect = host.getBoundingClientRect();
      const lines = root.children;
      const next: Placed[] = [];
      let shot = 0;
      for (const info of result.lines) {
        if (info.role === "shot") {
          shot = info.shotNumber ?? shot;
        }
        if (info.role !== "still" || !info.media || info.warning) {
          continue;
        }
        const element = lines.item(info.line);
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        // The line's bottom padding is the space reserved for the image; theme
        // spacing can be a CSS expression, so read the computed pixels.
        const style = getComputedStyle(element);
        const reserved = parseFloat(style.paddingBottom) || 0;
        const indent = parseFloat(style.paddingLeft) || 0;
        next.push({ line: info.line, uri: info.media, shot, top: rect.bottom - hostRect.top - reserved, left: rect.left - hostRect.left + indent });
      }
      setPlaced((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    measure();
    const unregister = editor.registerUpdateListener(() => {
      window.requestAnimationFrame(measure);
    });
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    return () => {
      unregister();
      observer.disconnect();
    };
  }, [editor, result]);

  return (
    <>
      {placed.map((item) => (
        <Box
          key={`${item.line}:${item.uri}`}
          aria-hidden
          sx={{
            position: "absolute",
            top: item.top,
            left: item.left,
            width: theme.spacing(STILL_THUMB_WIDTH),
            height: theme.spacing(STILL_THUMB_HEIGHT - 1),
            pointerEvents: "none",
            borderRadius: BORDER_RADIUS.md,
            overflow: "hidden"
          }}
        >
          <ResponsiveImage locator={item.uri} preferThumbnail alt={t("storyboardText.stillOf", { shot: item.shot })} fit="cover" aspectRatio="16 / 9" showSkeleton />
        </Box>
      ))}
    </>
  );
};

export default StoryboardMediaOverlay;
