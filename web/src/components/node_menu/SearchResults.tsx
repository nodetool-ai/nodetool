import React, { memo, useCallback } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText
} from "@mui/material";
import { Text } from "../ui_primitives";
import { NodeMetadata } from "../../stores/ApiTypes";

interface SearchResultsProps {
  results: NodeMetadata[];
  handleCreateNode: (node: NodeMetadata) => void;
}

const SearchResults = memo(({
  results,
  handleCreateNode
}: SearchResultsProps) => {
  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const handleNodeClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (nodeType) {
        const node = results.find((n) => n.node_type === nodeType);
        if (node) {
          handleCreateNode(node);
        }
      }
    },
    [results, handleCreateNode]
  );

  const renderNode = useCallback((node: NodeMetadata) => {
    const words = node.node_type?.split(".");
    return (
      <ListItemButton
        key={node.title}
        onClick={handleNodeClick}
        data-node-type={node.node_type}
      >
        {words.map((word, idx) => (
          <Box key={`${node.node_type}-${word}-${idx}`} sx={{ display: "flex" }}>
            <ListItemText sx={{ ml: 2 }}>
              <Text size="small">
                {word}
                {idx < words.length - 1 && " > "}
              </Text>
            </ListItemText>
          </Box>
        ))}
      </ListItemButton>
    );
  }, [handleNodeClick]);

  return (
    <List sx={{ overflowY: "scroll", maxHeight: "55vh" }}>
      {results.map(renderNode)}
    </List>
  );
});

SearchResults.displayName = "SearchResults";

export default SearchResults;
