/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useState } from "react";
import { NodeProps, NodeResizeControl, ResizeDragEvent } from "reactflow";
import { isEqual } from "lodash";
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
    const initWidth = 100;
    const initHeight = 50;
    const updateNodeData = useNodeStore((state) => state.updateNodeData);

    const [editor] = useState(() => withReact(createEditor()));
    const [value, setValue] = useState<Descendant[]>(() => {
      return Array.isArray(props.data.comment) && props.data.comment.length > 0
        ? props.data.comment
        : [{ type: "paragraph", children: [{ text: "" }] }];
    });

    const handleChange = useCallback(
      (newValue: Descendant[]) => {
        setValue(newValue);
        updateNodeData(props.id, { ...props.data, comment: newValue });
      },
      [updateNodeData, props.id, props.data]
    );
    const handleResize = (event: ResizeDragEvent) => {
      const newWidth = event.x;
      const newHeight = event.y;
      updateNodeData(props.id, {
        ...props.data,
        size: { width: newWidth, height: newHeight }
      });
    };

    return (
      <Container
        className={className}
        css={styles}
        style={{
          width: props.data.size?.width
            ? `${props.data.size.width}px`
            : `${initWidth}px`,
          height: props.data.size?.height
            ? `${props.data.size.height}px`
            : `${initHeight}px`
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
