import React, { useCallback } from "react";
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

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  handleCreateNode
}) => {
  const renderNode = useCallback((node: NodeMetadata) => {
    const words = node.node_type?.split(".");
    return (
      <ListItemButton key={node.title} onClick={handleCreateNode.bind(null, node)}>
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
  }, [handleCreateNode]);

  return (
    <List sx={{ overflowY: "scroll", maxHeight: "55vh" }}>
      {results.map(renderNode)}
    </List>
  );
};

export default SearchResults;
