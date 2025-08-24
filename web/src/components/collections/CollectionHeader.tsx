import React from "react";
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
        What are collections?
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
            Collections are used to store and search documents. Following file
            formats are supported:
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
    </Box>
  );
};

export default CollectionHeader;
