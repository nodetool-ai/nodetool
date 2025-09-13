import React from "react";
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
  const renderNode = (node: NodeMetadata) => {
    const words = node.node_type?.split(".");
    return (
      <ListItemButton key={node.title} onClick={() => handleCreateNode(node)}>
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
};

export default SearchResults;
