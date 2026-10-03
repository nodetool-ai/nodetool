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
            Collections store documents for semantic search. Drop text files
            here to index them:
          </Caption>
          <ul
            style={{
              marginTop: getSpacingPx(SPACING.xs),
              paddingLeft: getSpacingPx(SPACING.xl),
              listStyle: "disc"
            }}
          >
            <li>Plain text and Markdown</li>
            <li>HTML, CSV, and JSON</li>
          </ul>
          <Caption color="secondary">
            To index PDFs, Office files, or images, extract their text with a
            workflow first.
          </Caption>
        </FlexColumn>
      </Popover>
    </Box>
  );
};

export default CollectionHeader;
