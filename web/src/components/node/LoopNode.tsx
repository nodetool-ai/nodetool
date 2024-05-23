/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { Typography } from "@mui/material";
import { useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import { NodeProps, NodeResizeControl, ResizeDragEvent } from "reactflow";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import ThemeNodetool from "../themes/ThemeNodetool";
import useKeyPressedListener from "../../utils/KeyPressedListener";

const styles = (theme: any) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: "500px",
      minHeight: "350px"
    },
    "&.hovered.space-pressed": {
      border: "2px dashed black !important"
    },
    height: "100%",
    display: "flex",
    borderRadius: "5px",
    border: `1px solid ${theme.palette.c_gray1}`,
    backgroundColor: "#44444455",
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px"
    },
    ".tools .react-flow__resize-control.handle.bottom.right": {
      opacity: 1,
      right: "-8px",
      bottom: "-8px",
      margin: 0,
      borderRadius: "0 0 5px 0",
      width: "1.5em",
      height: "1.5em",
      background: "#222 !important"
    }
  });

const LoopNode = (props: NodeProps<NodeData>) => {
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const spaceKeyPressed = useKeyPressedListener(" ");
  const nodeHovered = useNodeStore((state) =>
    state.hoveredNodes.includes(props.id)
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
    <>
      <div
        className={`loop-node ${nodeHovered ? "hovered" : ""} ${
          spaceKeyPressed ? "space-pressed" : ""
        } `}
        css={styles}
        style={
          nodeHovered
            ? { border: `2px solid ${ThemeNodetool.palette.c_hl1}` }
            : {}
        }
      >
        <div className="tools">
          <NodeResizeControl
            style={{ background: "transparent", border: "none" }}
            minWidth={500}
            minHeight={350}
            onResize={handleResize}
          >
            <SouthEastIcon />
          </NodeResizeControl>
        </div>
        <Typography variant="h6">Loop</Typography>
      </div>
    </>
  );
};

export default memo(LoopNode);
