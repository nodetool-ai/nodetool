/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchResultsPanel from "./SearchResultsPanel";
import VirtualizedNodeList from "./VirtualizedNodeList";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const { groupedSearchResults, searchTerm } = useNodeMenuStore((state) => ({
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));

  const searchNodes = useMemo(() => {
    if (searchTerm && groupedSearchResults.length > 0) {
      return groupedSearchResults.flatMap((group) => group.nodes);
    }
    return null;
  }, [searchTerm, groupedSearchResults]);

  const style = searchNodes ? { height: "100%", overflow: "hidden" } : {};

  return (
    <div className="nodes" style={style}>
      {nodes.length > 0 ? (
        searchNodes ? (
          <SearchResultsPanel searchNodes={searchNodes} />
        ) : (
          <VirtualizedNodeList
            nodes={nodes}
            showCheckboxes={showCheckboxes}
            selectedNodeTypes={selectedNodeTypes}
            onToggleSelection={onToggleSelection}
            showFavoriteButton={showFavoriteButton}
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
