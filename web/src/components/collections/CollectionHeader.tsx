import InfoIcon from "@mui/icons-material/Info";
import { useState } from "react";
import {
  FlexRow,
  FlexColumn,
  Text,
  Caption,
  Box,
  Popover,
  SPACING,
  getSpacingPx,
  activateOnKey
} from "../ui_primitives";

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
        onKeyDown={activateOnKey<HTMLDivElement>((e) =>
          setFormatInfoAnchor(e.currentTarget)
        )}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={Boolean(formatInfoAnchor)}
      >
        <InfoIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
        <Text size="small" weight={600}>
          What are collections?
        </Text>
      </FlexRow>
      <Popover
        open={Boolean(formatInfoAnchor)}
        anchorEl={formatInfoAnchor}
        onClose={() => setFormatInfoAnchor(null)}
        placement="bottom-left"
      >
        <FlexColumn gap={1} sx={{ p: 2, maxWidth: 400 }}>
          <Caption color="secondary">
            Collections are used to store and search documents. Following file
            formats are supported:
          </Caption>
          <ul
            style={{
              marginTop: getSpacingPx(SPACING.xs),
              paddingLeft: getSpacingPx(SPACING.xl),
              listStyle: "disc"
            }}
          >
            <li>PDFs, PowerPoint, Word, Excel</li>
            <li>Text files, Markdown, HTML</li>
            <li>Images (text extraction with OCR)</li>
          </ul>
        </FlexColumn>
      </Popover>
    </Box>
  );
};

export default CollectionHeader;
