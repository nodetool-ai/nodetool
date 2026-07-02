/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, memo } from "react";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { EditorButton, SPACING, getSpacingPx } from "../ui_primitives";

interface ChunkDisplayProps {
  chunk: string;
}

const SCROLL_AMOUNT = 50;

const ChunkDisplay: React.FC<ChunkDisplayProps> = memo(({ chunk }) => {
  const chunkRef = useRef<HTMLDivElement>(null);
  const deferredChunk = useDeferredValue(chunk);

  useEffect(() => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop = chunkRef.current.scrollHeight;
    }
  }, [chunk]);

  const scrollUp = useCallback(() => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop -= SCROLL_AMOUNT;
    }
  }, []);

  const scrollDown = useCallback(() => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop += SCROLL_AMOUNT;
    }
  }, []);

  const containerStyles = useMemo(
    () => ({
      display: "flex",
      alignItems: "flex-start" as const,
    }),
    []
  );

  const chunkStyles = useMemo(
    () => ({
      overflowY: "scroll" as const,
      maxHeight: "200px",
      flexGrow: 1,
      marginRight: getSpacingPx(SPACING.md),
    }),
    []
  );

  const buttonContainerStyles = useMemo(
    () => ({
      display: "flex",
      flexDirection: "column" as const,
      gap: getSpacingPx(SPACING.xs),
    }),
    []
  );

  const chunkCss = useMemo(
    () =>
      css({
        marginTop: "0.5em",
        padding: "0.5em",
      }),
    []
  );

  return (
    <div style={containerStyles}>
      <div
        className="node-chunk"
        ref={chunkRef}
        css={chunkCss}
        style={chunkStyles}
      >
        <MarkdownRenderer content={deferredChunk} />
      </div>
      <div style={buttonContainerStyles}>
        <EditorButton size="small" onClick={scrollUp}>
          ↑
        </EditorButton>
        <EditorButton size="small" onClick={scrollDown}>
          ↓
        </EditorButton>
      </div>
    </div>
  );
});

ChunkDisplay.displayName = "ChunkDisplay";

export default ChunkDisplay;
