import React from "react";
import { Box, Popover, List, ListItem } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { useState } from "react";
import { FlexRow, FlexColumn, Text, Caption } from "../ui_primitives";

const CollectionHeader = () => {
  const [formatInfoAnchor, setFormatInfoAnchor] = useState<HTMLElement | null>(
    null
  );

  return (
    <Box sx={{ mb: 2 }}>
      <FlexRow
        align="center"
        gap={1}
        sx={{
          cursor: "pointer",
          "&:hover": { color: "primary.main" }
        }}
        onClick={(e) => setFormatInfoAnchor(e.currentTarget)}
      >
        <InfoIcon sx={{ fontSize: "1rem" }} />
        <Text size="small" weight={600}>
          What are collections?
        </Text>
      </FlexRow>
      <Popover
        open={Boolean(formatInfoAnchor)}
        anchorEl={formatInfoAnchor}
        onClose={() => setFormatInfoAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <FlexColumn gap={1} sx={{ p: 2, maxWidth: 400 }}>
          <Caption color="secondary">
            Collections are used to store and search documents. Following file
            formats are supported:
          </Caption>
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
        </FlexColumn>
      </Popover>
    </Box>
  );
};

export default CollectionHeader;
