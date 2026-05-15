/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState } from "react";

import { Text, ScrollArea } from "../ui_primitives";
import CategorySearchBar from "./CategorySearchBar";
import QuickAccessTile from "./QuickAccessTile";
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
      boxSizing: "border-box"
    },
    ".qa-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: theme.spacing(1),
      paddingBottom: theme.spacing(1)
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
 * 2-column tile grid of nodes that pass the category's filter (plan §7.4).
 * Owns the per-category search bar state — switching categories resets it.
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
      <ScrollArea fullHeight>
        {nodes.length === 0 ? (
          <Text className="qa-empty">No matching nodes</Text>
        ) : (
          <div className="qa-grid">
            {nodes.map((n) => (
              <QuickAccessTile key={n.node_type} node={n} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

QuickAccessGrid.displayName = "QuickAccessGrid";

export default QuickAccessGrid;
