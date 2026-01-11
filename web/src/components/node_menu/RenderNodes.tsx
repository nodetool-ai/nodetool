/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
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
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes
}) => {
  const { groupedSearchResults, searchTerm } =
    useNodeMenuStore((state) => ({
      groupedSearchResults: state.groupedSearchResults,
      searchTerm: state.searchTerm
    }));

  const typedGroupedResults: Array<{ namespace: string; nodes: NodeMetadata[] }> =
    useMemo(() => {
      return groupedSearchResults.map((group) => ({
        namespace: group.title,
        nodes: group.nodes
      }));
    }, [groupedSearchResults]);

  if (nodes.length === 0) {
    return (
      <div className="nodes">
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
      </div>
    );
  }

  return (
    <div className="nodes" style={{ height: "100%" }}>
      <VirtualizedNodeList
        nodes={nodes}
        groupedSearchResults={typedGroupedResults}
        searchTerm={searchTerm}
      />
    </div>
  );
};

export default memo(RenderNodes, isEqual);
