/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Command } from "cmdk";
import { memo, useCallback, useEffect } from "react";
import {
  useReactFlow,
  getNodesBounds,
  getViewportForBounds
} from "@xyflow/react";
import { useCanvasSearch } from "../../hooks/useCanvasSearch";
import { useCommandMenu } from "./CommandMenu";
import { Node } from "@xyflow/react";

const styles = () =>
  css({
    ".search-result-info": {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    ".search-result-title": {
      fontSize: "14px",
      fontWeight: 500
    },
    ".search-result-meta": {
      fontSize: "12px",
      opacity: 0.6,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".search-result-type": {
      padding: "2px 6px",
      borderRadius: "4px",
      backgroundColor: "rgba(0, 0, 0, 0.08)",
      fontSize: "11px"
    }
  });

interface CanvasSearchResultsProps {
  searchTerm: string;
  onClose: () => void;
}

const CanvasSearchResults = memo(function CanvasSearchResults({
  searchTerm,
  onClose
}: CanvasSearchResultsProps) {
  const executeAndClose = useCommandMenu(
    (state: { executeAndClose: (action: () => void) => void }) => state.executeAndClose
  );
  const reactFlowInstance = useReactFlow();

  const {
    searchResults,
    selectedResultIndex,
    setSelectedResultIndex
  } = useCanvasSearch();

  const handleSelect = useCallback(
    (result: { node: Node; matchType: string; matchText: string }) => {
      executeAndClose?.(() => {
        if (!result.node) return;
        const node = result.node;

        const nodesToFit = [node];
        const nodesBounds = getNodesBounds(nodesToFit);
        const viewport = getViewportForBounds(
          nodesBounds,
          nodesBounds.width,
          nodesBounds.height,
          0.5,
          2,
          0.1
        );

        reactFlowInstance.setViewport({
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom
        });

        reactFlowInstance.setNodes((nodes) =>
          nodes.map((n) =>
            n.id === node.id ? { ...n, selected: true } : { ...n, selected: false }
          )
        );
        onClose();
      });
    },
    [executeAndClose, reactFlowInstance, onClose]
  );

  const moveSelectionDown = useCallback(() => {
    if (searchResults.length === 0) return;
    setSelectedResultIndex((prev: number) =>
      prev >= searchResults.length - 1 ? 0 : prev + 1
    );
  }, [searchResults.length, setSelectedResultIndex]);

  const moveSelectionUp = useCallback(() => {
    if (searchResults.length === 0) return;
    setSelectedResultIndex((prev: number) =>
      prev <= 0 ? searchResults.length - 1 : prev - 1
    );
  }, [searchResults.length, setSelectedResultIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!searchTerm) { return; }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelectionDown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelectionUp();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm, moveSelectionDown, moveSelectionUp]);

  if (!searchTerm.trim()) {
    return null;
  }

  if (searchResults.length === 0) {
    return (
      <Command.Group heading="Canvas Nodes">
        <Command.Empty css={styles}>No nodes found matching &quot;{searchTerm}&quot;</Command.Empty>
      </Command.Group>
    );
  }

  return (
    <Command.Group heading={`Canvas Nodes (${searchResults.length})`} css={styles}>
      {searchResults.map((result) => {
        const nodeData = result.node.data as Record<string, unknown>;
        const title = (nodeData?.title as string) || result.node.type || "Untitled";
        const nodeId = result.node.id;
        const nodeType = result.node.type;

        return (
          <Command.Item
            key={nodeId}
            onSelect={() => handleSelect(result)}
            css={css`
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              cursor: pointer;
              border-radius: 4px;
              transition: background-color 0.15s ease;

              &[data-selected='true'] {
                background-color: rgba(25, 118, 210, 0.12);
              }

              &:hover {
                background-color: rgba(25, 118, 210, 0.08);
              }
            `}
          >
            <div className="search-result-info">
              <span className="search-result-title">{title}</span>
              <span className="search-result-meta">
                <span className="search-result-type">{nodeType}</span>
                <span>Match: &quot;{result.matchText}&quot;</span>
              </span>
            </div>
          </Command.Item>
        );
      })}
    </Command.Group>
  );
});

export default CanvasSearchResults;
