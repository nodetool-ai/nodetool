import React, { memo, useMemo } from "react";
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
  // Cache node handlers to prevent inline function recreation
  // Use useMemo to rebuild cache only when results or handleCreateNode changes
  const nodeHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    results.forEach((node) => {
      if (!handlers.has(node.title)) {
        handlers.set(node.title, () => handleCreateNode(node));
      }
    });
    return handlers;
  }, [results, handleCreateNode]);

  const renderNode = (node: NodeMetadata) => {
    const words = node.node_type?.split(".");
    const handleClick = nodeHandlers.get(node.title);

    return (
      <ListItemButton key={node.title} onClick={handleClick}>
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
  };

  return (
    <List sx={{ overflowY: "scroll", maxHeight: "55vh" }}>
      {results.map(renderNode)}
    </List>
  );
});

SearchResults.displayName = "SearchResults";

export default SearchResults;
