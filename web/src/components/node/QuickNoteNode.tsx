/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback, useRef, useMemo, useEffect } from "react";
import { NodeProps, Node } from "@xyflow/react";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { Box } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";

const QUICKNOTE_COLORS = [
  "#FFF9C4", // Yellow
  "#E3F2FD", // Blue
  "#E8F5E9", // Green
  "#FCE4EC", // Pink
  "#FFF3E0", // Orange
  "#F3E5F5", // Purple
  "#E0F7FA", // Cyan
  "#FFEBEE", // Red
];

const MIN_WIDTH = 120;
const MIN_HEIGHT = 80;
const MAX_WIDTH = 400;

function getContrastTextColor(hexColor: string): string {
  if (!hexColor) {
    return "#000000";
  }
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((char) => char + char).join("");
  }
  if (hex.length !== 6) {
    return "#000000";
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "#000000";
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    borderRadius: "4px",
    boxSizing: "border-box",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    "&:hover": {
      boxShadow: `0 2px 8px rgba(0, 0, 0, 0.15)`,
    },
    "&.selected": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "1px",
    },
  });

const noteTextStyles = css({
  flex: 1,
  width: "100%",
  height: "100%",
  border: "none",
  outline: "none",
  resize: "none",
  fontFamily: "inherit",
  fontSize: "14px",
  lineHeight: "1.5",
  backgroundColor: "transparent",
  padding: "8px",
  boxSizing: "border-box",
  "&::placeholder": {
    color: "inherit",
    opacity: 0.5,
  },
  "&:focus": {
    outline: "none",
  },
});

const colorPickerStyles = css({
  position: "absolute",
  top: "4px",
  right: "4px",
  display: "flex",
  gap: "2px",
  opacity: 0,
  transition: "opacity 0.2s ease",
  padding: "4px",
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  borderRadius: "4px",
  "&:hover": {
    opacity: 1,
  },
});

const colorSwatchStyles = (color: string, selected: boolean) =>
  css({
    width: "16px",
    height: "16px",
    borderRadius: "2px",
    cursor: "pointer",
    border: selected ? `2px solid #333` : "1px solid rgba(0,0,0,0.2)",
    transform: selected ? "scale(1.1)" : "scale(1)",
    transition: "transform 0.1s ease",
    "&:hover": {
      transform: "scale(1.15)",
    },
  });

const QuickNoteNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode,
  }));

  const [color, setColor] = useState(
    props.data.properties?.quicknote_color || QUICKNOTE_COLORS[0]
  );
  const [text, setText] = useState(
    props.data.properties?.quicknote_text || ""
  );
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const textColor = useMemo(() => {
    if (color.trim().startsWith("var(")) {
      return theme.vars.palette.text?.primary || "#000000";
    }
    return getContrastTextColor(color);
  }, [color, theme]);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newText: string, newColor: string) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            quicknote_text: newText,
            quicknote_color: newColor,
          },
        });
      }, 300),
    [props.id, props.data, updateNodeData]
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = event.target.value;
      setText(newText);
      debouncedUpdate(newText, color);
      autoResize();
    },
    [color, debouncedUpdate, autoResize]
  );

  const handleColorChange = useCallback(
    (newColor: string) => {
      setColor(newColor);
      updateNodeData(props.id, {
        ...props.data,
        properties: {
          ...props.data.properties,
          quicknote_color: newColor,
          quicknote_text: text,
        },
      });
    },
    [props.id, props.data, text, updateNodeData]
  );

  const autoResize = useCallback(() => {
    if (!textAreaRef.current || !containerRef.current) {
      return;
    }
    const textArea = textAreaRef.current;
    const container = containerRef.current;

    textArea.style.height = "auto";
    const newHeight = Math.max(
      textArea.scrollHeight,
      MIN_HEIGHT,
      60
    );
    textArea.style.height = `${newHeight}px`;

    const currentHeight = container.offsetHeight;
    const currentWidth = container.offsetWidth;

    const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 8;
    const paddingBottom = parseFloat(getComputedStyle(container).paddingBottom) || 8;
    const contentHeight = newHeight + paddingTop + paddingBottom;
    const finalHeight = Math.max(contentHeight, MIN_HEIGHT);

    const paddingLeft = parseFloat(getComputedStyle(container).paddingLeft) || 8;
    const paddingRight = parseFloat(getComputedStyle(container).paddingRight) || 8;
    const contentWidth = textArea.scrollWidth + paddingLeft + paddingRight + 40;
    const finalWidth = Math.min(Math.max(contentWidth, MIN_WIDTH), MAX_WIDTH);

    if (
      Math.abs(currentHeight - finalHeight) > 1 ||
      Math.abs(currentWidth - finalWidth) > 1
    ) {
      updateNode(props.id, {
        width: finalWidth,
        height: finalHeight,
      });
    }
  }, [props.id, updateNode]);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  return (
    <Box
      ref={containerRef}
      style={{
        backgroundColor: hexToRgba(color, 0.9),
        color: textColor,
      }}
      className={`node-drag-handle quicknote-node ${
        props.selected ? "selected" : ""
      }`}
      css={styles(theme)}
    >
      <Box css={colorPickerStyles} className="color-picker">
        {QUICKNOTE_COLORS.map((c) => (
          <Box
            key={c}
            css={colorSwatchStyles(c, c === color)}
            style={{ backgroundColor: c }}
            onClick={(e) => {
              e.stopPropagation();
              handleColorChange(c);
            }}
            title={`Change color to ${c}`}
          />
        ))}
      </Box>
      <textarea
        ref={textAreaRef}
        className="quicknote-text"
        value={text}
        onChange={handleTextChange}
        placeholder="Type a note..."
        css={noteTextStyles}
        style={{ color: textColor }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <NodeResizeHandle minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />
    </Box>
  );
};

export default memo(QuickNoteNode, isEqual);
