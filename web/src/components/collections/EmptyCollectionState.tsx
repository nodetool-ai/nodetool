import { Box, Typography, List, ListItem, Divider } from "@mui/material";

const EmptyCollectionState = () => {
  return (
    <Box sx={{ marginTop: 2, maxWidth: 600 }}>
      <Typography variant="h2" sx={{ margin: "1em 0 .5em 0" }}>
        ChromaDB Collections
      </Typography>
      <Typography variant="body1" sx={{ marginBottom: 1 }}>
        ChromaDB is a vector database for storing embeddings. In NodeTool,
        collections organize these vector representations of your text and
        images.
      </Typography>
      <Typography variant="body1" sx={{ marginBottom: 2 }}>
        Creating a collection enables semantic search in your workflows,
        allowing nodes to find and process data based on conceptual meaning
        rather than exact keyword matches.
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h4">
          No collections found. Create one to get started.
        </Typography>

        <Typography variant="body1">With a collection, you can:</Typography>
        <List sx={{ pl: 2, mb: 1 }}>
          <ListItem sx={{ display: "list-item" }}>
            Index text and images as vector embeddings
          </ListItem>
          <ListItem sx={{ display: "list-item" }}>
            Perform semantic similarity searches
          </ListItem>
          <ListItem sx={{ display: "list-item" }}>
            Filter search results using metadata
          </ListItem>
          <ListItem sx={{ display: "list-item" }}>
            Batch process large sets of documents
          </ListItem>
        </List>
        <Typography variant="body1">
          Key nodes include <strong>Index Image</strong> and{" "}
          <strong>Index Text Chunk</strong> for populating data, and{" "}
          <strong>Query Image</strong>, <strong>Query Text</strong>, or{" "}
          <strong>Hybrid Search</strong> for retrieval.
        </Typography>
      </Box>
    </Box>
  );
};

export default EmptyCollectionState;
