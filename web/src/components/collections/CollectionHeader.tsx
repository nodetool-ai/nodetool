import { Box, Typography, Popover, List, ListItem } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { useState } from "react";

interface CollectionHeaderProps {
  isElectron: boolean;
}

const CollectionHeader = () => {
  const [formatInfoAnchor, setFormatInfoAnchor] = useState<HTMLElement | null>(
    null
  );

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        File Indexing with MarkItDown
      </Typography>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 0.5,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          "&:hover": { color: "primary.main" }
        }}
        onClick={(e) => setFormatInfoAnchor(e.currentTarget)}
      >
        <InfoIcon sx={{ mr: 1, fontSize: "1rem" }} />
        Supported Formats
      </Typography>
      <Popover
        open={Boolean(formatInfoAnchor)}
        anchorEl={formatInfoAnchor}
        onClose={() => setFormatInfoAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box sx={{ p: 2, maxWidth: 400 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Supported file formats:
          </Typography>
          <List dense sx={{ mt: 1, pl: 2 }}>
            <ListItem sx={{ display: "list-item" }}>
              PDFs, PowerPoint, Word, Excel
            </ListItem>
            <ListItem sx={{ display: "list-item" }}>
              Text files, Markdown, HTML
            </ListItem>
            <ListItem sx={{ display: "list-item" }}>
              Images (text extraction with OCR)
            </ListItem>
          </List>
        </Box>
      </Popover>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1, fontSize: "0.8em" }}
      >
        All files will be analyzed and added to the collection for semantic
        search.
      </Typography>
    </Box>
  );
};

export default CollectionHeader;
