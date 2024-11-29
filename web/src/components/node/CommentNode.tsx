/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useState, useCallback, useRef } from "react";
import { NodeProps, NodeResizeControl, Node } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useNodeStore } from "../../stores/NodeStore";
import { createEditor } from "slate";
import { Slate, Editable, withReact, ReactEditor } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import { hexToRgba } from "../../utils/ColorUtils";
import ThemeNodes from "../../components/themes/ThemeNodes";
import ColorPicker from "../inputs/ColorPicker";

type CustomElement = { type: "paragraph"; children: CustomText[] };
type CustomText = { text: string };

const styles = (theme: any) =>
  css({
    "&.comment-node": {
      width: "100%",
      height: "100%",
      margin: 0,
      padding: 0,
      border: `1px solid ${hexToRgba(theme.palette.c_white, 0.3)}`,
      boxShadow: `0 0 8px ${hexToRgba(theme.palette.c_white, 0.1)}`,
      backgroundColor: "transparent",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      "&:hover": {
        border: `1px solid ${hexToRgba(theme.palette.c_white, 0.5)}`,
        boxShadow: `0 0 12px ${hexToRgba(theme.palette.c_white, 0.2)}`
      },
      "&.collapsed": {
        maxHeight: "60px"
      },
      label: {
        display: "none"
      }
    },
    ".node-header": {
      width: "100%",
      height: "20px",
      minHeight: "unset",
      margin: 0,
      padding: "0 0.5em",
      left: "0px",
      backgroundColor: "transparent",
      border: 0,
      position: "absolute",
      top: 0,
      display: "flex",
      alignItems: "center",
      input: {
        wordSpacing: "-3px",
        fontSize: theme.fontSizeBigger,
        fontWeight: "bold",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none"
      }
    },
    ".text-editor": {
      width: "100%",
      color: theme.palette.c_black,
      height: "calc(100% - 40px)",
      fontSize: theme.fontSizeBigger,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.2em",
      position: "absolute",
      overflowX: "hidden",
      overflowY: "auto",
      top: "40px",
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
    "&:hover .color-picker-button": {
      opacity: 1
    },
    ".MuiTouchRipple-root": {
      width: 0,
      height: 0
    },
    ".color-picker-button": {
      pointerEvents: "all",
      opacity: 0,
      position: "absolute",
      bottom: "0",
      margin: "0",
      padding: "0",
      right: "1em",
      left: "unset",
      width: "0em",
      height: "1.1em",
      zIndex: 10000,
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "0",
      "& svg": {
        color: theme.palette.c_gray5,
        width: ".5em",
        height: ".5em",
        // scale: ".5",
        rotate: "-86deg"
      },
      "&:hover svg": {
        color: theme.palette.c_hl1
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

const CommentNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const className = `comment-node ${props.data.collapsed ? "collapsed " : ""}${
    props.selected ? "selected" : ""
  }`.trim();
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
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

  const handleClick = () => {
    ReactEditor.focus(editor);
  };

  const handleHeaderClick = () => {
    headerInputRef.current?.focus();
    headerInputRef.current?.select();
  };

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
      style={{ backgroundColor: hexToRgba(color, 0.3) }}
      className={className}
      css={styles}
    >
      <NodeResizeControl
        style={{ background: "transparent", border: "none" }}
        minWidth={30}
        minHeight={40}
      >
        <SouthEastIcon />
      </NodeResizeControl>
      <div
        className="node-header"
        onClick={handleHeaderClick}
        style={{
          backgroundColor: hexToRgba(color, 0.2),
          padding: "1.25em .5em"
        }}
      >
        <input
          ref={headerInputRef}
          spellCheck={false}
          className="nodrag"
          type="text"
          value={headline}
          onChange={handleHeadlineChange}
          placeholder=""
          style={{
            backgroundColor: "transparent",
            color: "rgba(0, 0, 0, 0.87)",
            border: 0,
            outline: "none",
            width: "90%"
          }}
        />
      </div>
      <div className="text-editor" onClick={handleClick}>
        <Slate editor={editor} onChange={handleChange} initialValue={value}>
          <Editable
            placeholder="//"
            spellCheck={false}
            className="editable nodrag nowheel"
          />
        </Slate>
      </div>
      <ColorPicker
        color={color}
        onColorChange={handleColorChange}
        showCustom={false}
      />
    </Container>
  );
};

export default memo(CommentNode, isEqual);
