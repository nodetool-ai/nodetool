import React, { memo } from "react";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { PageLayout } from "../ui_primitives";
import CollectionList from "./CollectionList";

/**
 * Full-screen Collections page. Reachable from the logo menu; wraps the
 * collection list in the shared manager chrome (header + back button).
 */
const CollectionsExplorer: React.FC = () => (
  <PageLayout
    icon={<LibraryBooksOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Collections"
    subtitle="Searchable document collections for RAG workflows — drop in PDFs, Markdown, HTML, or transcripts."
    docsTopic="collections"
  >
    <CollectionList />
  </PageLayout>
);

CollectionsExplorer.displayName = "CollectionsExplorer";

export default memo(CollectionsExplorer);
