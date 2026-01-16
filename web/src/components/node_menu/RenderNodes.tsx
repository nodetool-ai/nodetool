/** @jsxImportSource @emotion/react */
import { memo } from "react";
// mui
import { Typography } from "@mui/material";
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import VirtualizedNodeList from "./VirtualizedNodeList";
import isEqual from "lodash/isEqual";

interface RenderNodesProps {
  nodes: NodeMetadata[];
}

const RenderNodes: React.FC<RenderNodesProps> = ({ nodes }) => {
  const { searchTerm, groupedSearchResults } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    groupedSearchResults: state.groupedSearchResults
  }));

  const searchNodes = searchTerm && groupedSearchResults.length > 0
    ? groupedSearchResults.flatMap((group) => group.nodes)
    : null;

  const isSearchMode = searchTerm.length > 0 && groupedSearchResults.length > 0;

  const style = searchNodes ? { height: "100%", overflow: "hidden" } : {};

  return (
    <div className="nodes" style={style}>
      {nodes.length > 0 ? (
        isSearchMode && searchNodes ? (
          <VirtualizedNodeList
            nodes={searchNodes}
            isSearchMode={isSearchMode}
            searchTerm={searchTerm}
          />
        ) : (
          <VirtualizedNodeList
            nodes={nodes}
            isSearchMode={false}
            searchTerm=""
          />
        )
      ) : (
        <div className="no-selection">
          <div className="explanation">
            <Typography variant="h5" style={{ marginTop: 0 }}>
              Browse Nodes
            </Typography>
            <ul>
              <li>Click on the namespaces to the left</li>
            </ul>

            <Typography variant="h5">Search Nodes</Typography>
            <ul>
              <li>Type in the search bar to search for nodes.</li>
            </ul>

            <Typography variant="h5">Create Nodes</Typography>
            <ul>
              <li>Click on a node</li>
              <li>Drag a node onto the canvas</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RenderNodes, isEqual);
