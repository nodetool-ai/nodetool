/** @jsxImportSource @emotion/react */
import React, { useMemo, useRef, useCallback } from "react";
import NodeInfo from "../../node_menu/NodeInfo";
import { css } from "@emotion/react";
import Draggable from "react-draggable";
import { Button } from "@mui/material";
import { useNodeStore } from "../../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import ThemeNodetool from "../../themes/ThemeNodetool";
import useSessionStateStore from "../../../stores/SessionStateStore";
import useMetadataStore from "../../../stores/MetadataStore";

const styles = (theme: any) => css`
  position: absolute;
  z-index: 1000;
  background-color: ${theme.palette.background.paper};
  border: 1px solid ${theme.palette.divider};
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 0px;
  max-width: 400px;
  min-width: 300px;

  .handle {
    cursor: move;
    min-height: 2rem;
    margin-bottom: 0.5rem;
    background-color: ${theme.palette.background.default};
    border-bottom: 1px solid ${theme.palette.divider};
  }

  h1 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: ${theme.palette.primary.main};
  }

  .loading {
    font-size: 1rem;
    color: ${theme.palette.text.secondary};
  }

  .warning {
    font-size: 1rem;
    color: ${theme.palette.c_warning};
  }
  .content {
    padding: 10px;
  }

  .close-button {
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: ${theme.palette.text.secondary};
  }

  .open-node-menu-button {
    color: ${theme.palette.c_hl1};
    margin-top: 10px;
    margin-right: 10px;
  }
`;

interface DraggableNodeDocumentationProps {
  nodeType: string;
  position: { x: number; y: number };
  onClose: () => void;
}

const DraggableNodeDocumentation: React.FC<DraggableNodeDocumentationProps> = ({
  nodeType,
  position,
  onClose
}) => {
  const nodeMetadata = useMetadataStore((state) =>
    state.getMetadata(nodeType ?? "")
  );
  const nodeRef = useRef<HTMLDivElement>(null);
  const { createNode, addNode } = useNodeStore();
  const reactFlowInstance = useReactFlow();
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const { leftPanelWidth } = useSessionStateStore();
  const handleAddNode = useCallback(() => {
    if (nodeMetadata && nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      const newPosition = reactFlowInstance.screenToFlowPosition({
        x: rect.right + 20,
        y: rect.top
      });

      const newNode = createNode(nodeMetadata, newPosition);
      newNode.selected = true;
      addNode(newNode);
      onClose();
    }
  }, [nodeMetadata, createNode, addNode, reactFlowInstance, onClose]);

  const handleOpenNodeMenu = useCallback(() => {
    if (nodeType) {
      const searchTerm = nodeType.replace(/\./g, " ");
      openNodeMenu(leftPanelWidth, 100, false, "", null, searchTerm);
    }
  }, [nodeType, openNodeMenu, leftPanelWidth]);

  const content = useMemo(() => {
    if (!nodeMetadata)
      return (
        <div className="warning">
          {nodeType} <br />
          <span style={{ color: ThemeNodetool.palette.c_gray6 }}>
            Sorry, this node does not exist.
          </span>
          <Button
            variant="outlined"
            className="open-node-menu-button"
            onClick={handleOpenNodeMenu}
            style={{ marginTop: "10px" }}
          >
            Search for similar nodes
          </Button>
        </div>
      );
    return (
      <>
        <NodeInfo nodeMetadata={nodeMetadata} />
        <Button
          variant="contained"
          color="primary"
          onClick={handleAddNode}
          style={{ marginTop: "10px", marginRight: "10px" }}
        >
          Add Node
        </Button>
      </>
    );
  }, [nodeMetadata, nodeType, handleAddNode, handleOpenNodeMenu]);

  return (
    <Draggable handle=".handle" defaultPosition={position} nodeRef={nodeRef}>
      <div css={styles} ref={nodeRef}>
        <div className="handle"></div>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
        <div className="content">{content}</div>
      </div>
    </Draggable>
  );
};

export default React.memo(DraggableNodeDocumentation);
