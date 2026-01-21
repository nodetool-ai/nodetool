import React, { memo, useCallback } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography
} from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";

interface SearchResultsProps {
  results: NodeMetadata[];
  handleCreateNode: (node: NodeMetadata) => void;
}

const SearchResults = memo(({
  results,
  handleCreateNode
}: SearchResultsProps) => {
  const handleNodeClick = useCallback((node: NodeMetadata) => () => {
    handleCreateNode(node);
  }, [handleCreateNode]);

  const renderNode = useCallback((node: NodeMetadata) => {
    const words = node.node_type?.split(".");
    return (
      <ListItemButton key={node.title} onClick={handleNodeClick(node)}>
        {words.map((word, idx) => (
          <Box key={idx} sx={{ display: "flex" }}>
            <ListItemText sx={{ ml: 2 }}>
              <Typography fontSize="small">
                {word}
                {idx < words.length - 1 && " > "}
              </Typography>
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
