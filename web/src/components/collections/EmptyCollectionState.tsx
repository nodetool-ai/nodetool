import { Box, Typography, List, ListItem } from "@mui/material";

const EmptyCollectionState = () => {
  return (
    <Box sx={{ marginTop: 2 }}>
      <Typography variant="h2" sx={{ margin: "1em 0 .5em 0" }}>
        ChromaDB Collections
      </Typography>
      <Typography variant="body1" sx={{ marginBottom: 1 }}>
        Collections are powerful vector databases that enable semantic search
        and retrieval of your assets.
      </Typography>
      <Typography variant="h4" sx={{ margin: "1em 0" }}>
        Create a new collection to make use of nodes in the Chroma namespace.
      </Typography>
      <Typography variant="body1" sx={{ marginBottom: 1 }}>
        Collections enable you to:
      </Typography>
      <List sx={{ pl: 2, mb: 1 }}>
        <ListItem sx={{ display: "list-item" }}>
          Store embeddings of text, images, and other assets
        </ListItem>
        <ListItem sx={{ display: "list-item" }}>
          Enable semantic similarity search across content
        </ListItem>
        <ListItem sx={{ display: "list-item" }}>
          Organize and retrieve assets based on their meaning, not just keywords
        </ListItem>
      </List>
    </Box>
  );
};

export default EmptyCollectionState;
