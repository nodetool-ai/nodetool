import React, { memo } from "react";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { PageLayout, ICON_SIZE } from "../ui_primitives";
import CollectionList from "./CollectionList";
import { useTranslation } from "react-i18next";

/**
 * Full-screen Collections page. Reachable from the logo menu; wraps the
 * collection list in the shared manager chrome (header + back button).
 */
const CollectionsExplorer: React.FC = () => {
  const { t } = useTranslation();
  return <PageLayout
    icon={<LibraryBooksOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
    title={t("screen_assets.collections.title")}
    subtitle={t("screen_assets.collections.subtitle")}
    docsTopic="collections"
  >
    <CollectionList />
  </PageLayout>;
};

CollectionsExplorer.displayName = "CollectionsExplorer";

export default memo(CollectionsExplorer);
