/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo } from "react";
import { useMetadata } from "../../../serverState/useMetadata";
import NodeInfo from "../../node_menu/NodeInfo";
import { css } from "@emotion/react";
import Draggable from "react-draggable";

const styles = (theme: any) => css`
  position: absolute;
  z-index: 1000;
  background-color: ${theme.palette.background.paper};
  border: 1px solid ${theme.palette.divider};
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 1rem;
  max-width: 400px;
  min-width: 300px;

  .handle {
    cursor: move;
    padding-bottom: 0.5rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid ${theme.palette.divider};
    font-weight: bold;
    color: ${theme.palette.text.primary};
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

  .error {
    font-size: 1rem;
    color: ${theme.palette.error.main};
  }

  .close-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: ${theme.palette.text.secondary};
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
  const { data, isLoading } = useMetadata();
  const nodeMetadata = nodeType ? data?.metadataByType[nodeType] : null;

  const content = useMemo(() => {
    if (isLoading) return <div className="loading">Loading...</div>;
    if (!nodeMetadata)
      return <div className="error">No data available for this node type.</div>;
    return <NodeInfo nodeMetadata={nodeMetadata} />;
  }, [isLoading, nodeMetadata]);

  return (
    <Draggable handle=".handle" defaultPosition={position}>
      <div css={styles}>
        <div className="handle">{nodeType}</div>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
        {content}
      </div>
    </Draggable>
  );
};

export default React.memo(DraggableNodeDocumentation);
