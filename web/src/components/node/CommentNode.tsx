/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useState, useCallback } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { createEditor, Editor } from "slate";
import { Slate, Editable, withReact, ReactEditor } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import { hexToRgba } from "../../utils/ColorUtils";
import ThemeNodes from "../../components/themes/ThemeNodes";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import FormatButton from "./FormatButton";

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
      padding: "2.5em 1em 1em 1em",
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
      color: theme.palette.c_black,
      fontSize: theme.fontSizeBig,
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
      top: ".5em",
      right: "3em",
      display: "flex",
      gap: "4px",
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s ease",
      "& button": {
        padding: "1px 5px",
        minWidth: "20px",
        fontSize: "12px",
        backgroundColor: hexToRgba(theme.palette.c_white, 0.1),
        border: `1px solid ${hexToRgba(theme.palette.c_white, 0.2)}`,
        borderRadius: "3px",
        color: theme.palette.c_black,
        cursor: "pointer",
        "&:hover": {
          backgroundColor: hexToRgba(theme.palette.c_white, 0.2)
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
      width: "2em",
      height: "2em",
      overflow: "hidden",
      top: ".3em",
      right: ".5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0,
      transition: "opacity 0.2s ease",
      "&:hover": {
        opacity: 0.9
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
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
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

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      setValue(newValue);
      debounce((newData) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            ...newData
          }
        });
      }, 500)({
        comment: newValue
      });
    },
    [props.data, props.id, updateNodeData]
  );

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
        />
        <FormatButton
          format="italic"
          label="i"
          isActive={isMarkActive("italic")}
          onToggle={toggleMark}
        />
        <FormatButton
          format="size"
          label="-"
          isActive={isMarkActive("size") && Editor.marks(editor)?.size === "-"}
          onToggle={(format, label) => toggleMark(format, label)}
        />
        <FormatButton
          format="size"
          label="+"
          isActive={isMarkActive("size") && Editor.marks(editor)?.size === "+"}
          onToggle={(format, label) => toggleMark(format, label)}
        />
      </div>
      <div className="text-editor" onClick={handleClick}>
        <Slate editor={editor} onChange={handleChange} initialValue={value}>
          <Editable
            placeholder="//"
            spellCheck={false}
            className="editable nodrag nowheel"
            onKeyDown={onKeyDown}
            renderLeaf={renderLeaf}
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
