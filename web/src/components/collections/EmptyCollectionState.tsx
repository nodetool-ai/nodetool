import { Box, List, ListItem, Divider } from "@mui/material";
import { Text, FlexColumn } from "../ui_primitives";

const EmptyCollectionState = () => {
  return (
    <Box sx={{ marginTop: 2, maxWidth: 600 }}>
      <Text size="bigger" sx={{ margin: "1em 0 .5em 0" }}>
        Vector Collections
      </Text>
      <Text sx={{ marginBottom: 1 }}>
        Collections organize vector representations of your text and images in a
        local SQLite database.
      </Text>
      <Text sx={{ marginBottom: 2 }}>
        Creating a collection enables semantic search in your workflows,
        allowing nodes to find and process data based on conceptual meaning
        rather than exact keyword matches.
      </Text>

      <Divider sx={{ my: 3 }} />

      <FlexColumn gap={2}>
        <Text size="big">
          No collections found. Create one to get started.
        </Text>

        <Text>With a collection, you can:</Text>
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
        <Text>
          Key nodes include <strong>Index Image</strong> and{" "}
          <strong>Index Text Chunk</strong> for populating data, and{" "}
          <strong>Query Image</strong>, <strong>Query Text</strong>, or{" "}
          <strong>Hybrid Search</strong> for retrieval.
        </Text>
      </FlexColumn>
    </Box>
  );
};

export default EmptyCollectionState;
