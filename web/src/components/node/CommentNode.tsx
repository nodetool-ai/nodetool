/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback, useRef, useMemo } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";
import ThemeNodes from "../../components/themes/ThemeNodes";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import LexicalEditor from "../textEditor/LexicalEditor";
import { convertSlateToLexical } from "../textEditor/editorUtils";
import { EditorState } from "lexical";

// Function to calculate contrast color (black or white) for a given hex background
function getContrastTextColor(hexColor: string): string {
  if (!hexColor) return "#000000"; // Default to black if no color
  let hex = hexColor.replace("#", "");

  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (hex.length !== 6) {
    // console.warn("Invalid hex color for contrast calculation:", hexColor);
    return "#000000"; // Default to black for non-standard hex
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    // console.warn("Error parsing RGB from hex:", hexColor);
    return "#000000"; // Default to black on parse error
  }

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export type CustomElement = {
  type: "paragraph";
  children: CustomText[];
};

export type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: "-" | "+";
};

// Simplified styles for now
const styles = (theme: any) =>
  css({
    width: "100%",
    height: "100%",
    margin: 0,
    borderRadius: "3px",
    padding: "1em .5em",
    boxSizing: "border-box",
    boxShadow: `inset 0 0 5px 1px #00000011`,
    backgroundColor: "transparent",
    position: "relative",
    "&:hover": {
      boxShadow: `inset 0 0 8px 1px #ffffff11`
    },
    ".text-editor-container": {
      width: "100%",
      height: "100%",
      overflowX: "hidden",
      overflowY: "auto",
      color: "inherit",
      "& .editor-input": {
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeNormal,
        lineHeight: "1.1em",
        color: "inherit",
        caretColor: "inherit",
        height: "100%",
        width: "100%",
        padding: 0,
        outline: "none",
        border: "none",
        resize: "none"
      },
      "& .editor-placeholder": {
        color: "rgba(0, 0, 0, 0.6)",
        top: "1em",
        left: ".5em"
      }
    },
    "&:hover .color-picker-container": {
      opacity: 0.5
    },
    ".color-picker-container": {
      position: "absolute",
      top: "0",
      right: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "2em",
      height: "2em",
      overflow: "hidden",
      opacity: 0,
      transition: "opacity 0.2s ease",
      "&:hover": {
        opacity: 1
      }
    },
    ".node-resize-handle": {
      opacity: 0.6,
      transition: "opacity 0.2s ease",
      "&:hover": {
        opacity: 1
      }
    }
  });

const CommentNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode
  }));
  const [color, setColor] = useState(
    props.data.properties.comment_color ||
      ThemeNodes.palette.c_bg_comment ||
      "#ffffff"
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<EditorState | null>(null);

  const initialEditorState = useMemo(() => {
    const commentData =
      props.data.properties.comment_lexical ?? props.data.properties.comment;
    if (commentData) {
      if (props.data.properties.comment_lexical) {
        return JSON.stringify(commentData);
      }
      return convertSlateToLexical(commentData);
    }
    return undefined;
  }, [props.data.properties.comment, props.data.properties.comment_lexical]);

  const textColor = getContrastTextColor(color);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newEditorState: EditorState) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            comment_lexical: newEditorState.toJSON()
          }
        });
      }, 500),
    [props.id, props.data, updateNodeData]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (!contentOnFocusRef.current) {
        contentOnFocusRef.current = editorState;
      }
      debouncedUpdate(editorState);
    },
    [debouncedUpdate]
  );

  const handleScaleToFit = useCallback(() => {
    if (editorContainerRef.current && containerRef.current) {
      const editorDiv = editorContainerRef.current.querySelector(
        ".editor-input"
      ) as HTMLDivElement;
      if (!editorDiv) return;

      const containerDiv = containerRef.current;

      const MIN_WIDTH = 100;
      const MAX_WIDTH = 600;
      const bufferX = 20;

      const newWidth = editorDiv.scrollWidth + bufferX;
      const finalWidth = Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH);

      const currentDOMWidth = containerDiv.offsetWidth;
      const widthNeedsUpdate = Math.abs(currentDOMWidth - finalWidth) > 1;

      if (widthNeedsUpdate) {
        updateNode(props.id, {
          width: finalWidth,
          height: containerDiv.offsetHeight
        });
      }

      requestAnimationFrame(() => {
        const contentHeight = editorDiv.scrollHeight;
        const paddingTop =
          parseFloat(getComputedStyle(containerDiv).paddingTop) || 0;
        const paddingBottom =
          parseFloat(getComputedStyle(containerDiv).paddingBottom) || 0;
        const bufferY = 2;
        const newHeight = contentHeight + paddingTop + paddingBottom + bufferY;
        const MIN_HEIGHT = 40;
        const finalHeight = Math.max(newHeight, MIN_HEIGHT);

        const currentDOMHeight = containerDiv.offsetHeight;
        const heightNeedsUpdate = Math.abs(currentDOMHeight - finalHeight) > 1;

        if (heightNeedsUpdate || widthNeedsUpdate) {
          updateNode(props.id, {
            width: finalWidth,
            height: finalHeight,
            data: {
              ...props.data,
              size: { width: finalWidth, height: finalHeight }
            }
          });
        }
      });
    }
  }, [props.id, props.data, updateNode]);

  const handleBlur = useCallback(
    (latestEditorState: EditorState) => {
      if (
        contentOnFocusRef.current &&
        !isEqual(contentOnFocusRef.current.toJSON(), latestEditorState.toJSON())
      ) {
        handleScaleToFit();
      }
      contentOnFocusRef.current = null;
    },
    [handleScaleToFit]
  );

  const handleColorChange = useCallback(
    (newColor: string | null) => {
      setColor(newColor || "");
      updateNodeData(props.id, {
        ...props.data,
        properties: {
          ...props.data.properties,
          comment_color: newColor
        }
      });
    },
    [props.id, props.data, updateNodeData]
  );

  return (
    <Container
      ref={containerRef}
      style={{ backgroundColor: hexToRgba(color, 0.5), color: textColor }}
      className={`node-drag-handle comment-node ${
        props.selected ? "selected" : ""
      }`}
      css={styles(ThemeNodes)}
    >
      <div ref={editorContainerRef} className="text-editor-container">
        <LexicalEditor
          initialState={initialEditorState}
          onChange={handleEditorChange}
          onBlur={handleBlur}
        />
      </div>
      <div className="color-picker-container">
        <ColorPicker
          color={color}
          onColorChange={handleColorChange}
          showCustom={false}
        />
      </div>
      <NodeResizeHandle minWidth={30} minHeight={40} />
    </Container>
  );
};

export default memo(CommentNode, isEqual);
