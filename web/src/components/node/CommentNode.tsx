/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useState, useCallback, useRef } from "react";
import { NodeProps, NodeResizeControl, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container, Icon, IconButton } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { createEditor, Editor, Element, Transforms } from "slate";
import { Slate, Editable, withReact, ReactEditor } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import { hexToRgba } from "../../utils/ColorUtils";
import ThemeNodes from "../../components/themes/ThemeNodes";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";

type CustomElement = {
  type: "paragraph";
  children: CustomText[];
};

type CustomText = {
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
      padding: "2em 1em",
      // border: `1px solid ${hexToRgba(theme.palette.c_white, 0.3)}`,
      boxShadow: `0 0 8px ${hexToRgba(theme.palette.c_white, 0.1)}`,
      backgroundColor: "transparent",
      // transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      "&:hover": {
        // border: `1px solid ${hexToRgba(theme.palette.c_white, 0.5)}`,
        boxShadow: `0 0 12px ${hexToRgba(theme.palette.c_white, 0.2)}`
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
      color: theme.palette.c_black,
      fontSize: theme.fontSizeBigger,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.2em",
      overflowX: "hidden",
      overflowY: "auto",
      left: 0,
      padding: "0 1em",
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
      top: "1em",
      right: "4em",
      display: "flex",
      gap: "4px",
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s ease",
      "& button": {
        padding: "2px 6px",
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
    "&:hover .format-buttons": {
      opacity: 1
    },
    ".color-picker-container": {
      position: "absolute",
      top: "1em",
      right: "1em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0
    }
  });

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

const CommentNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const className = `comment-node ${props.data.collapsed ? "collapsed " : ""}${
    props.selected ? "selected" : ""
  }`.trim();
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
  }));
  const [editor] = useState(() => withReact(createEditor()));
  const [color, setColor] = useState(
    props.data.properties.comment_color || ThemeNodes.palette.c_bg_comment
  );
  const [headline, setHeadline] = useState(
    props.data.properties.headline || ""
  );
  const [value, setValue] = useState<Descendant[]>(() => {
    return Array.isArray(props.data.properties.comment) &&
      props.data.properties.comment.length > 0
      ? props.data.properties.comment
      : [{ type: "paragraph", children: [{ text: "" }] }];
  });
  const headerInputRef = useRef<HTMLInputElement>(null);

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

  const handleHeadlineChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newHeadline = event.target.value;
      setHeadline(newHeadline);
      debounce((newData) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            ...newData
          }
        });
      }, 500)({
        headline: newHeadline
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

  const isMarkActive = (format: keyof Omit<CustomText, "text">) => {
    const marks = Editor.marks(editor);
    return marks ? marks[format] === true : false;
  };

  const toggleMark = (format: keyof Omit<CustomText, "text">, value?: any) => {
    const isActive = isMarkActive(format);
    if (isActive) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, value ?? true);
    }
  };

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
    [editor, toggleMark]
  );

  const renderLeaf = useCallback((props: any) => {
    let style = { ...props.attributes.style };

    if (props.leaf.bold) {
      style.fontWeight = "bold";
    }

    if (props.leaf.size) {
      switch (props.leaf.size) {
        case "-":
          style.fontSize = "1em";
          break;
        case "+":
          style.fontSize = "1.5em";
          break;
      }
    }

    return (
      <span {...props.attributes} style={style}>
        {props.children}
      </span>
    );
  }, []);

  const FormatButton = ({
    format,
    label
  }: {
    format: keyof Omit<CustomText, "text">;
    label: string;
  }) => {
    const active = isMarkActive(format);
    return (
      <button
        className={`nodrag ${active ? "active" : ""}`}
        onMouseDown={(event) => {
          event.preventDefault();
          toggleMark(format, label);
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <Container
      style={{ backgroundColor: hexToRgba(color, 0.5) }}
      className={className}
      css={styles}
    >
      <div className="format-buttons">
        <FormatButton format="bold" label="B" />
        <FormatButton format="italic" label="I" />
        <FormatButton format="size" label="-" />
        <FormatButton format="size" label="+" />
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
