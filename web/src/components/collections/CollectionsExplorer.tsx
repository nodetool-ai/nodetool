import React, { memo } from "react";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import CollectionList from "./CollectionList";

/**
 * Full-screen Collections page. Reachable from the logo menu; wraps the
 * collection list in the shared manager chrome (header + back button).
 */
const CollectionsExplorer: React.FC = () => (
  <ManagerPageLayout
    icon={<LibraryBooksOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Collections"
    subtitle="Searchable document collections for RAG workflows — drop in PDFs, Markdown, HTML, or transcripts."
    docsUrl="https://docs.nodetool.ai/collections.html"
  >
    <CollectionList />
  </ManagerPageLayout>
);

CollectionsExplorer.displayName = "CollectionsExplorer";

export default memo(CollectionsExplorer);
