/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback, useRef, useMemo } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import LexicalPlugins from "../textEditor/LexicalEditor";
import { convertSlateToLexical } from "../textEditor/editorUtils";
import {
  EditorState,
  $getRoot,
  $createParagraphNode,
  $createTextNode
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import ToolbarPlugin from "../textEditor/ToolbarPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";

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
    return "#000000";
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "#000000";
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

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    margin: 0,
    borderRadius: "3px",
    padding: "1em .5em",
    boxSizing: "border-box",
    boxShadow: `inset 0 0 5px 1px #00000011`,
    position: "relative",
    "&:hover": {
      boxShadow: `inset 0 0 8px 1px #ffffff11`
    },
    ".text-editor-container": {
      width: "100%",
      height: "100%",
      maxHeight: "fit-content",
      overflowX: "hidden",
      "& .editor-input": {
        height: "unset",
        paddingTop: ".5em",
        lineHeight: "1.1em",
        caretColor: "var(--palette-primary-contrastText)"
      },
      "& .editor-input .font-size-large": {
        fontSize: "var(--fontSizeBig)"
      }
    },
    ".format-toolbar-container": {
      display: "none",
      position: "absolute",
      top: "-35px",
      left: "0",
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(240, 240, 240, 0.08)",
      borderRadius: "3px",
      padding: "0.25em 0.5em",
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s .2s ease"
    },
    "&:hover .format-toolbar-container": {
      opacity: 1,
      display: "flex"
    },
    ".format-toolbar-actions": {
      transition: "opacity .2s .1s ease",
      opacity: 0
    },
    "&.focused .format-toolbar-actions": {
      opacity: 1
    },
    "&:hover .color-picker-container": {
      opacity: 0.5
    },
    ".color-picker-container": {
      position: "absolute",
      top: ".5em",
      right: ".5em",
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

const initialConfigTemplate = {
  namespace: "CommentNodeEditor",
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode
  ],
  theme: {
    text: {
      large: "font-size-large",
      bold: "editor-text-bold",
      italic: "editor-text-italic",
      underline: "editor-text-underline",
      strikethrough: "editor-text-strikethrough",
      code: "editor-text-code"
    },
    link: "editor-link",
    code: "editor-code",
    heading: {
      h1: "editor-heading-h1",
      h2: "editor-heading-h2",
      h3: "editor-heading-h3",
      h4: "editor-heading-h4",
      h5: "editor-heading-h5",
      h6: "editor-heading-h6"
    },
    list: {
      ul: "editor-list-ul",
      ol: "editor-list-ol",
      listitem: "editor-listitem"
    },
    quote: "editor-quote"
  }
};

const CommentNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode
  }));
  const [color, setColor] = useState(
    props.data.properties.comment_color ||
      theme.vars.palette.c_bg_comment ||
      "#ffffff"
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<EditorState | null>(null);
  const [isEditorFocused, setIsEditorFocused] = useState(false);

  const editorConfig = useMemo(() => {
    const config: any = {
      ...initialConfigTemplate
    };

    const comment = props.data.properties.comment;

    // Handle string comments as markdown
    if (typeof comment === "string" && comment.length > 0) {
      config.editorState = (editor: any) => {
        $convertFromMarkdownString(comment, TRANSFORMERS);
      };
    }
    // Handle existing Lexical editor state
    else if (
      comment &&
      typeof comment === "object" &&
      comment.root &&
      Object.keys(comment).length > 0
    ) {
      config.editorState = JSON.stringify(comment);
    }

    return config;
  }, [props.data.properties.comment]);

  const textColor = useMemo(() => {
    if (color.trim().startsWith("var(")) {
      return theme.vars.palette.text?.primary || "#000000";
    }
    return getContrastTextColor(color);
  }, [color, theme]);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newEditorState: EditorState) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            comment: newEditorState.toJSON()
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
    if (editorRef.current && containerRef.current) {
      const editorDiv = editorRef.current.querySelector(
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
    <LexicalComposer initialConfig={editorConfig}>
      <Container
        ref={containerRef}
        style={{
          backgroundColor: hexToRgba(color, 0.5),
          color: textColor,
          paddingRight: "2em"
        }}
        className={`node-drag-handle comment-node ${
          props.selected ? "selected" : ""
        } ${isEditorFocused ? "focused" : ""}`.trim()}
        css={styles(theme)}
      >
        <div className="format-toolbar-container">
          <ToolbarPlugin />
        </div>
        <div ref={editorRef} className="text-editor-container">
          <LexicalPlugins
            onChange={handleEditorChange}
            onBlur={handleBlur}
            onFocusChange={setIsEditorFocused}
          />
        </div>
        <div className="color-picker-container">
          <ColorPicker
            color={color}
            buttonSize={16}
            onColorChange={handleColorChange}
            showCustom={false}
          />
        </div>
        <NodeResizeHandle minWidth={30} minHeight={40} />
      </Container>
    </LexicalComposer>
  );
};

export default memo(CommentNode, isEqual);
