import InfoIcon from "@mui/icons-material/InfoOutlined";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlexRow,
  FlexColumn,
  Text,
  Caption,
  Box,
  Popover,
  SPACING,
  getSpacingPx,
  activateOnKey,
  ICON_SIZE
} from "../ui_primitives";

const CollectionHeader = () => {
  const { t } = useTranslation();
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
        <InfoIcon sx={{ fontSize: ICON_SIZE.sm }} />
        <Text size="small" weight={600}>
          {t("i18n-next30.collections.headerTitle")}
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
            {t("i18n-next30.collections.headerDescription")}
          </Caption>
          <ul
            style={{
              marginTop: getSpacingPx(SPACING.xs),
              paddingLeft: getSpacingPx(SPACING.xl),
              listStyle: "disc"
            }}
          >
            <li>{t("i18n-next30.collections.fileTypesText")}</li>
            <li>{t("i18n-next30.collections.fileTypesStructured")}</li>
          </ul>
          <Caption color="secondary">
            {t("i18n-next30.collections.fileTypesUnsupported")}
          </Caption>
        </FlexColumn>
      </Popover>
    </Box>
  );
};

export default CollectionHeader;
