/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState } from "react";

import { Text } from "../ui_primitives";
import CategorySearchBar from "./CategorySearchBar";
import SearchResultsPanel from "./SearchResultsPanel";
import useMetadataStore from "../../stores/MetadataStore";
import {
  filterNodesForCategory,
  type QuickAccessCategory
} from "../../config/quickAccessCategories";

const styles = (theme: Theme) =>
  css({
    "&.qa-grid-container": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      height: "100%",
      padding: theme.spacing(1),
      boxSizing: "border-box",
      minHeight: 0
    },
    ".qa-list": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".qa-empty": {
      padding: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    }
  });

interface QuickAccessGridProps {
  category: QuickAccessCategory;
}

/**
 * Virtualized list of nodes that pass the category's filter. Uses the same
 * compact rows as the sidebar Search view. Owns the per-category search
 * bar state — switching categories resets it.
 */
const QuickAccessGrid = memo<QuickAccessGridProps>(({ category }) => {
  const theme = useTheme();
  const [query, setQuery] = useState("");

  // Pulls the full metadata dict; selector returns the raw record so we get a
  // stable reference unless metadata actually changes.
  const metadataRecord = useMetadataStore((s) => s.metadata);

  const nodes = useMemo(() => {
    const all = Object.values(metadataRecord);
    return filterNodesForCategory(category, all, query);
  }, [category, metadataRecord, query]);

  return (
    <div css={styles(theme)} className="qa-grid-container">
      <CategorySearchBar
        value={query}
        onChange={setQuery}
        placeholder={`Filter ${category.label.toLowerCase()}...`}
      />
      <div className="qa-list">
        {nodes.length === 0 ? (
          <Text className="qa-empty">No matching nodes</Text>
        ) : (
          <SearchResultsPanel searchNodes={nodes} compact />
        )}
      </div>
    </div>
  );
});

QuickAccessGrid.displayName = "QuickAccessGrid";

export default QuickAccessGrid;
