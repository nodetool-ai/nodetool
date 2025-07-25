/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useRef } from "react";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";
import { Tooltip } from "@mui/material";
// components
import { NodeHeader } from "./NodeHeader";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import NodeResizer from "./NodeResizer";
// utils
import { getMousePosition } from "../../utils/MousePosition";
// store
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// constants
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import { isEqual } from "lodash";
import useMetadataStore from "../../stores/MetadataStore";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: "400px",
      minHeight: "250px"
    },
    "&.hovered.control-pressed": {
      border: "2px dashed black !important"
    },
    height: "100%",
    display: "flex",
    borderRadius: "5px",
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    backgroundColor: theme.vars.palette.c_bg_loop,
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px"
    },
    // header
    ".node-header": {
      height: "3em",
      backgroundColor: "rgba(0,0,0,0.1)"
    },
    ".inputs": {
      // center child vertically
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      position: "absolute",
      top: "3.4em",
      left: "0"
    },
    ".input-label, .output-label": {
      position: "absolute",
      height: "1.75em",
      top: "0.6em",
      left: "0",
      padding: ".2em .75em",
      textAlign: "center",
      display: "block",
      backgroundColor: theme.vars.palette.c_input,
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeSmall
    },
    ".output-label": {
      backgroundColor: theme.vars.palette.c_output,
      position: "absolute",
      top: "4.2em",
      left: "unset",
      right: "0"
    },
    "& .react-flow__handle-right": {
      top: "4.5em"
    },
    ".info": {
      position: "absolute",
      top: ".5em",
      right: "0",
      left: "0",
      width: "100%",
      textAlign: "center",
      padding: ".5em",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[1000],
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    }
  });

const LoopNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const { updateNode, updateNodeData } = useNodes((state) => ({
    updateNode: state.updateNode,
    updateNodeData: state.updateNodeData
  }));
  const theme = useTheme();
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const handleResize = useCallback(
    (event: ResizeDragEvent) => {
      const newWidth = event.x;
      const newHeight = event.y;
      updateNodeData(props.id, {
        ...props.data,
        size: { width: newWidth, height: newHeight }
      });
    },
    [props.id, props.data, updateNodeData]
  );

  const handleOpenNodeMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      openNodeMenu({
        x: getMousePosition().x,
        y: getMousePosition().y
      });
    },
    [openNodeMenu]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("node-header")) {
        updateNodeData(id, { collapsed: !props.data.collapsed });
      } else {
        handleOpenNodeMenu(e);
      }
    },
    [props.data.collapsed, updateNodeData, handleOpenNodeMenu]
  );

  useEffect(() => {
    /*
     * HACK: allow panning the canvas when clicking inside the node
     * Observe parent elements' classes and remove the "nopan" class
     */
    const removeNoPanClass = () => {
      if (nodeRef.current) {
        const parent = nodeRef.current.closest(".react-flow__node");
        if (parent && parent.classList.contains("nopan")) {
          parent.classList.remove("nopan");
        }
      }
    };
    removeNoPanClass();
    const observer = new MutationObserver(() => {
      removeNoPanClass();
    });
    if (nodeRef.current) {
      const parent = nodeRef.current.closest(".react-flow__node");
      if (parent) {
        observer.observe(parent, {
          attributes: true,
          attributeFilter: ["class"]
        });
      }
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // Selectable loop nodes when control key is pressed
    // (enables the use of the selection rectangle inside group nodes)
    updateNode(props.id, { selectable: false });
  }, [updateNode, props.id]);

  const nodeMetadata = getMetadata(props.type);

  const nodeHovered = useNodes((state) =>
    state.hoveredNodes.includes(props.id)
  );

  if (!nodeMetadata) {
    return <div>Missing node: {props.type}</div>;
  }

  return (
    <div
      ref={nodeRef}
      className={`loop-node ${props.data.collapsed ? "collapsed" : ""}`}
      onDoubleClick={(e) => {
        handleDoubleClick(e, props.id);
      }}
      css={styles(theme)}
      style={
        nodeHovered
          ? { border: `2px solid ${theme.vars.palette.primary.main}` }
          : {}
      }
    >
      <div className="inputs">
        <NodeInputs
          id={props.id}
          nodeType={props.type}
          properties={nodeMetadata.properties}
          data={props.data}
          showFields={false}
          showHandle={true}
          basicFields={["input"]}
          showAdvancedFields={true}
        />
        <Tooltip
          title="Loop nodes expect a List or Dataframe of any type. Use the GroupInput node inside the loop to use those items one by one."
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        >
          <div className="input-label">Input</div>
        </Tooltip>
      </div>
      <NodeHeader
        id={props.id}
        data={props.data}
        metadataTitle="Loop"
        selected={props.selected}
      />
      {/* {nodeHovered && (
        <div className="info">Hold SPACE key to move nodes out of the loop</div>
      )} */}
      <div className="outputs">
        <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
        <Tooltip
          title="Returns the data of the GroupOutput outside the loop."
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        >
          <div className="output-label">Output</div>
        </Tooltip>
      </div>
      <NodeResizeHandle
        minWidth={400}
        minHeight={250}
        onResize={handleResize}
      />
      <NodeResizer minWidth={400} minHeight={250} />
    </div>
  );
};

export default memo(LoopNode, isEqual);
