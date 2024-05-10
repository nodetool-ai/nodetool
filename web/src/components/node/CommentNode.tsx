/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useState } from "react";
import { NodeProps, NodeResizeControl, ResizeDragEvent } from "reactflow";
import { debounce, isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useNodeStore } from "../../stores/NodeStore";
import { createEditor } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import { ReactEditor } from "slate-react";
import SouthEastIcon from "@mui/icons-material/SouthEast";
// import { createEditor, Node as SlateNode, Transforms } from "slate";

type CustomElement = { type: "paragraph"; children: CustomText[] };
type CustomText = { text: string };

const styles = css({
  "&.comment-node": {
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    backgroundColor: "transparent",
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
    padding: 0,
    left: "0px",
    backgroundColor: "transparent",
    border: 0,
    position: "absolute",
    top: 0
  },
  textarea: {
    backgroundColor: "transparent",
    border: 0,
    outline: "none"
  },
  ".text-editor": {
    width: "100%",
    height: "calc(100% - 20px)",
    fontSize: "var(--font-size-tiny)",
    fontFamily: "var(--font_family)",
    wordSpacing: "-1px",
    lineHeight: "1.2em",
    position: "absolute",
    overflowX: "hidden",
    overflowY: "auto",
    top: "20px",
    left: 0,
    padding: "0 0.5em 0.5em 0.5em"
  },
  ".text-editor .editable": {
    outline: "none",
    border: 0,
    boxShadow: "none",
    outlineOffset: "0px",
    cursor: "auto"
  }
});

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

export default memo(
  function CommentNode(props: NodeProps<NodeData>) {
    const className = `comment-node  ${
      props.data.collapsed ? "collapsed " : ""
    }${props.selected ? "selected" : ""}`.trim();
    const [width, setWidth] = useState(100);
    const [height, setHeight] = useState(50);
    const updateNodeData = useNodeStore((state) => state.updateNodeData);
    const [editor] = useState(() => withReact(createEditor()));
    const [value, setValue] = useState<Descendant[]>(() => {
      return Array.isArray(props.data.properties.comment) &&
        props.data.properties.comment.length > 0
        ? props.data.properties.comment
        : [{ type: "paragraph", children: [{ text: "" }] }];
    });

    const debouncedUpdate = useCallback(
      debounce(() => {
        updateNodeData(props.id, {
          ...props.data,
          size: { width, height },
          properties: {
            comment: value
          }
        });
      }, 500),
      [updateNodeData, props.id, props.data]
    );

    const handleChange = useCallback(
      (newValue: Descendant[]) => {
        setValue(newValue);
        debouncedUpdate();
      },
      [setValue, debouncedUpdate]
    );

    const handleResize = useCallback(
      (event: ResizeDragEvent) => {
        setWidth(event.x);
        setHeight(event.y);
        debouncedUpdate();
      },
      [setWidth, setHeight, debouncedUpdate]
    );

    return (
      <Container
        className={className}
        css={styles}
        style={{
          width: `${width}px`,
          height: `${height}px`
        }}
      >
        <NodeResizeControl
          style={{ background: "transparent", border: "none" }}
          minWidth={30}
          minHeight={40}
          onResize={handleResize}
        >
          <SouthEastIcon />
        </NodeResizeControl>
        <div className="node-header"></div>
        <div className="text-editor ">
          <Slate editor={editor} onChange={handleChange} initialValue={value}>
            <Editable
              placeholder="//"
              spellCheck={false}
              className="editable nodrag nowheel"
            />
          </Slate>
        </div>
      </Container>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);
