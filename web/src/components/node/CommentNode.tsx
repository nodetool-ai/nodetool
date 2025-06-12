/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useState, useCallback, useRef, useMemo } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { createEditor, Editor, Node as SlateNode } from "slate";
import { Slate, Editable, withReact, ReactEditor } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import { hexToRgba } from "../../utils/ColorUtils";
import ThemeNodes from "../../components/themes/ThemeNodes";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import FormatButton from "./FormatButton";

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

const styles = (theme: any) =>
  css({
    "&.comment-node": {
      width: "100%",
      height: "100%",
      margin: 0,
      borderRadius: "3px",
      padding: "1em .5em",
      boxShadow: `inset 0 0 5px 1px #00000011`,
      backgroundColor: "transparent",
      "&:hover": {
        boxShadow: `inset 0 0 8px 1px #ffffff11`
      },
      "&.collapsed": {
        maxHeight: "60px"
      },
      label: {
        display: "none"
      }
    },
    ".text-editor": {
      width: "100%",
      height: "100%",
      overflowX: "hidden",
      overflowY: "auto",
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.1em",
      left: 0,
      padding: "0 .2em",
      "& [data-slate-placeholder='true']": {
        color: "rgba(0, 0, 0, 0.6)"
      }
    },
    ".text-editor .editable": {
      outline: "none",
      border: 0,
      boxShadow: "none",
      outlineOffset: "0px",
      cursor: "auto"
    },
    "&:hover .color-picker-container": {
      opacity: 0.5
    },
    ".MuiTouchRipple-root": {
      width: 0,
      height: 0
    },
    ".format-buttons": {
      position: "absolute",
      top: "-2em",
      left: "50%",
      padding: "0.5em 2em",
      transform: "translateX(-50%)",
      display: "flex",
      gap: "4px",
      zIndex: 1,
      opacity: 0,
      minWidth: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: hexToRgba(theme.palette.c_white, 0.05),
      borderRadius: ".25em .25em 0 0",
      transition: "opacity 0.2s ease",
      "& button": {
        padding: "1px 5px",
        minWidth: "20px",
        fontSize: "12px",
        border: "none",
        lineHeight: "1.2em",
        backgroundColor: hexToRgba(theme.palette.c_white, 0.6),
        borderRadius: "3px",
        color: theme.palette.c_black,
        cursor: "pointer",
        transition: "background-color 0.2s ease",
        "&:hover": {
          backgroundColor: hexToRgba(theme.palette.c_white, 0.8)
        },
        "&.active": {
          backgroundColor: hexToRgba(theme.palette.c_white, 0.3),
          borderColor: hexToRgba(theme.palette.c_white, 0.4)
        }
      }
    },
    "&:hover .format-buttons, &:hover .node-resize-handle": {
      opacity: 1
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

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

const renderLeaf = (props: any) => {
  const style = { ...props.attributes.style };

  if (props.leaf.bold) {
    style.fontWeight = "bold";
  }

  if (props.leaf.italic) {
    style.fontStyle = "italic";
  }

  if (props.leaf.size) {
    switch (props.leaf.size) {
      case "-":
        style.fontSize = "1em";
        break;
      case "+":
        style.fontSize = "1.25em";
        style.lineHeight = "1.2em";
        break;
    }
  }

  return (
    <span {...props.attributes} style={style}>
      {props.children}
    </span>
  );
};

const CommentNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const className = `node-drag-handle comment-node ${
    props.data.collapsed ? "collapsed " : ""
  }${props.selected ? "selected" : ""}`.trim();
  const { updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode
  }));
  const [editor] = useState(() => withReact(createEditor()));
  const [color, setColor] = useState(
    props.data.properties.comment_color ||
      ThemeNodes.palette.c_bg_comment ||
      "#ffffff"
  );
  const [value, setValue] = useState<Descendant[]>(() => {
    return Array.isArray(props.data.properties.comment) &&
      props.data.properties.comment.length > 0
      ? props.data.properties.comment
      : [{ type: "paragraph", children: [{ text: "" }] }];
  });

  const textColor = getContrastTextColor(color);
  const containerRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<Descendant[]>();

  const debouncedUpdate = useMemo(
    () =>
      debounce((newData) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            ...newData
          }
        });
      }, 500),
    [props.id, props.data, updateNodeData]
  );

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      setValue(newValue);
      debouncedUpdate({
        comment: newValue
      });
    },
    [debouncedUpdate]
  );

  const handleScaleToFit = useCallback(() => {
    if (textEditorRef.current && containerRef.current) {
      const textEditorDiv = textEditorRef.current;
      const containerDiv = containerRef.current;

      // --- Width Calculation (X-axis) ---
      const MIN_WIDTH = props.data.size?.width
        ? Math.min(props.data.size.width, 100)
        : 100;
      const MAX_WIDTH = 600;
      const bufferX = 20;
      let maxContentWidth = 0;

      const tempSpan = document.createElement("span");
      try {
        document.body.appendChild(tempSpan);
        const editorStyle = getComputedStyle(textEditorDiv);
        tempSpan.style.fontFamily = editorStyle.fontFamily;
        tempSpan.style.fontSize = editorStyle.fontSize;
        tempSpan.style.fontWeight = editorStyle.fontWeight;
        tempSpan.style.fontStyle = editorStyle.fontStyle;
        tempSpan.style.letterSpacing = editorStyle.letterSpacing;
        tempSpan.style.whiteSpace = "nowrap";
        tempSpan.style.visibility = "hidden";
        tempSpan.style.position = "absolute";
        tempSpan.style.padding = "0";
        tempSpan.style.border = "none";

        if (editor.children && editor.children.length > 0) {
          for (const paragraph of editor.children) {
            const lineText = SlateNode.string(paragraph);
            tempSpan.textContent = lineText || " ";
            maxContentWidth = Math.max(maxContentWidth, tempSpan.offsetWidth);
          }
        } else {
          tempSpan.textContent = " ".repeat(10);
          maxContentWidth = tempSpan.offsetWidth;
        }
      } catch (e) {
        maxContentWidth = MIN_WIDTH;
      } finally {
        if (tempSpan.parentNode === document.body) {
          document.body.removeChild(tempSpan);
        }
      }

      const paddingLeft =
        parseFloat(getComputedStyle(containerDiv).paddingLeft) || 0;
      const paddingRight =
        parseFloat(getComputedStyle(containerDiv).paddingRight) || 0;
      const newWidth = maxContentWidth + paddingLeft + paddingRight + bufferX;
      const finalWidth = Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH);

      // --- Node Update ---
      const currentDOMHeight = containerDiv.offsetHeight;
      const currentDOMWidth = containerDiv.offsetWidth;

      const initialWidthNeedsUpdate =
        Math.abs(currentDOMWidth - finalWidth) > 1;

      if (initialWidthNeedsUpdate) {
        // Update width first
        const widthUpdatePayload: Partial<Node<NodeData>> = {
          width: finalWidth,
          // Keep current height for now, or use a reasonable temp height
          height: containerDiv.offsetHeight,
          data: {
            ...props.data,
            size: { width: finalWidth, height: containerDiv.offsetHeight }
          }
        };
        if (updateNode) {
          updateNode(props.id, widthUpdatePayload);
        }
      }

      requestAnimationFrame(() => {
        // Recalculate height after width has been applied and reflowed
        const newOriginalTextEditorStyleHeight = textEditorDiv.style.height;
        textEditorDiv.style.height = "auto";
        const newContentScrollHeight = textEditorDiv.scrollHeight;
        textEditorDiv.style.height = newOriginalTextEditorStyleHeight;

        const newPaddingTop =
          parseFloat(getComputedStyle(containerDiv).paddingTop) || 0;
        const newPaddingBottom =
          parseFloat(getComputedStyle(containerDiv).paddingBottom) || 0;
        const newBufferY = 2;
        const recalculatedNewHeight =
          newContentScrollHeight +
          newPaddingTop +
          newPaddingBottom +
          newBufferY;
        const newMinHeight = 40;
        const recalculatedFinalHeight = Math.max(
          recalculatedNewHeight,
          newMinHeight
        );

        // Use the updated container height after width change for comparison
        const updatedDOMHeight = containerDiv.offsetHeight;
        const heightNeedsUpdateAfterWidth =
          Math.abs(updatedDOMHeight - recalculatedFinalHeight) > 1;

        // Only update if height still needs adjustment or if width was not updated initially but height does
        if (
          heightNeedsUpdateAfterWidth ||
          (!initialWidthNeedsUpdate &&
            Math.abs(currentDOMHeight - recalculatedFinalHeight) > 1)
        ) {
          const finalSizeForData = {
            width: finalWidth,
            height: recalculatedFinalHeight
          };
          const nodeUpdatePayload: Partial<Node<NodeData>> = {
            width: finalWidth,
            height: recalculatedFinalHeight,
            data: {
              ...props.data,
              size: finalSizeForData
            }
          };
          if (updateNode) {
            updateNode(props.id, nodeUpdatePayload);
          }
        }
      });
    }
  }, [props.id, props.data, updateNode, editor]);

  const onFocus = () => {
    contentOnFocusRef.current = editor.children;
  };

  const handleBlur = useCallback(() => {
    if (!isEqual(contentOnFocusRef.current, editor.children)) {
      handleScaleToFit();
    }
  }, [handleScaleToFit, editor]);

  const handleClick = useCallback(() => {
    ReactEditor.focus(editor);
  }, [editor]);

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

  const isMarkActive = useCallback(
    (format: keyof Omit<CustomText, "text">) => {
      const marks = Editor.marks(editor);
      return marks ? marks[format] !== undefined : false;
    },
    [editor]
  );

  const toggleMark = useCallback(
    (format: keyof Omit<CustomText, "text">, value?: any) => {
      const isActive = isMarkActive(format);
      if (isActive) {
        Editor.removeMark(editor, format);
      } else {
        Editor.addMark(editor, format, value ?? true);
      }
    },
    [editor, isMarkActive]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        !(navigator.userAgent.includes("Mac") ? event.metaKey : event.ctrlKey)
      )
        return;

      switch (event.key) {
        case "b": {
          event.preventDefault();
          toggleMark("bold");
          break;
        }
        case "i": {
          event.preventDefault();
          toggleMark("italic");
          break;
        }
      }
    },
    [toggleMark]
  );

  return (
    <Container
      ref={containerRef}
      style={{ backgroundColor: hexToRgba(color, 0.5) }}
      className={className}
      css={styles}
    >
      <div className="format-buttons">
        <FormatButton
          format="bold"
          label="b"
          isActive={isMarkActive("bold")}
          onToggle={toggleMark}
          tooltipText="Make selected text Bold (Ctrl+B)"
        />
        <FormatButton
          format="italic"
          label="i"
          isActive={isMarkActive("italic")}
          onToggle={toggleMark}
          tooltipText="Make selected text Italic (Ctrl+I) "
        />
        <FormatButton
          format="size"
          label="+"
          isActive={isMarkActive("size") && Editor.marks(editor)?.size === "+"}
          onToggle={(format, label) => toggleMark(format, label)}
          tooltipText="Increase Font Size for selected text"
        />
      </div>
      <div
        ref={textEditorRef}
        className="text-editor"
        onClick={handleClick}
        css={css`
          color: ${textColor};
          & [data-slate-placeholder="true"] {
            color: ${hexToRgba(textColor, 0.6)};
          }
        `}
      >
        <Slate editor={editor} onChange={handleChange} initialValue={value}>
          <Editable
            placeholder="// type here"
            spellCheck={false}
            className="editable nodrag nowheel"
            onKeyDown={onKeyDown}
            renderLeaf={renderLeaf}
            onFocus={onFocus}
            onBlur={handleBlur}
          />
        </Slate>
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
