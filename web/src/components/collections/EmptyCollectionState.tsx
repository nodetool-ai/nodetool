import { useTranslation } from "react-i18next";
import {
  Text,
  FlexColumn,
  Divider,
  Box,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const EmptyCollectionState = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ marginTop: 2, maxWidth: 600 }}>
      <Text
        size="big"
        sx={{
          margin: `${getSpacingPx(SPACING.xl)} 0 ${getSpacingPx(SPACING.md)} 0`
        }}
      >
        {t("i18n-next1.collections.title")}
      </Text>
      <Text sx={{ marginBottom: 1 }}>
        {t("i18n-next1.collections.description")}
      </Text>
      <Text sx={{ marginBottom: 2 }}>
        {t("i18n-next1.collections.semanticSearchDescription")}
      </Text>

      <Divider sx={{ my: 3 }} />

      <FlexColumn gap={2}>
        <Text size="big">{t("i18n-next1.collections.emptyTitle")}</Text>

        <Text>{t("i18n-next1.collections.capabilitiesIntro")}</Text>
        <ul
          style={{
            paddingLeft: getSpacingPx(SPACING.xl),
            marginBottom: getSpacingPx(SPACING.xs),
            listStyle: "disc"
          }}
        >
          <li>{t("i18n-next1.collections.capabilityIndex")}</li>
          <li>{t("i18n-next1.collections.capabilitySearch")}</li>
          <li>{t("i18n-next1.collections.capabilityFilter")}</li>
          <li>{t("i18n-next1.collections.capabilityBatch")}</li>
        </ul>
        <Text>
          {t("i18n-next1.collections.keyNodes", {
            indexImage: t("i18n-next1.collections.nodes.indexImage"),
            indexTextChunk: t("i18n-next1.collections.nodes.indexTextChunk"),
            queryImage: t("i18n-next1.collections.nodes.queryImage"),
            queryText: t("i18n-next1.collections.nodes.queryText"),
            hybridSearch: t("i18n-next1.collections.nodes.hybridSearch")
          })}
        </Text>
      </FlexColumn>
    </Box>
  );
};

export default EmptyCollectionState;
