/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Text } from "../ui_primitives";
import CategorySearchBar from "./CategorySearchBar";
import SearchResultsPanel from "./SearchResultsPanel";
import useMetadataStore from "../../stores/MetadataStore";
import {
  filterNodesForCategory,
  NODE_SUBCATEGORIES,
  getNodeSubcategory
} from "../../config/quickAccessCategories";
import type { NodeCategoryId } from "../../stores/PanelStore";

const styles = (theme: Theme) =>
  css({
    "&.qa-grid-container": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.75),
      height: "100%",
      padding: 0,
      boxSizing: "border-box",
      minHeight: 0
    },
    ".qa-tabs": {
      display: "flex",
      flexWrap: "wrap",
      gap: "2px",
      paddingBottom: theme.spacing(0.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "& .qa-tab": {
        padding: "3px 7px",
        borderRadius: "var(--rounded-sm)",
        color: theme.vars.palette.text.secondary,
        backgroundColor: "transparent",
        fontSize: "0.72rem",
        lineHeight: 1.2,
        letterSpacing: "0.01em",
        textTransform: "none",
        minWidth: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        cursor: "pointer",
        border: "none",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "& svg": {
          fontSize: "0.9rem"
        },
        "&:hover": {
          backgroundColor: `${theme.vars.palette.action.hover}66`,
          color: theme.vars.palette.text.primary
        },
        "&.active": {
          backgroundColor: `${theme.vars.palette.action.selected}66`,
          color: theme.vars.palette.primary.main,
          boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
        }
      }
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
  activeSubcategory: NodeCategoryId;
  onSubcategoryChange: (id: NodeCategoryId) => void;
}

/**
 * Unified node browser: a search input, a row of category tabs ("All" + node
 * families), and a virtualized result list. The search query filters within
 * the active tab; "All" searches across every node.
 */
const QuickAccessGrid = memo<QuickAccessGridProps>(
  ({ activeSubcategory, onSubcategoryChange }) => {
    const theme = useTheme();
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      searchRef.current?.focus();
    }, []);

    const category =
      getNodeSubcategory(activeSubcategory) ?? NODE_SUBCATEGORIES[0];

    const metadataRecord = useMetadataStore((s) => s.metadata);

    const nodes = useMemo(() => {
      const all = Object.values(metadataRecord);
      return filterNodesForCategory(category, all, query);
    }, [category, metadataRecord, query]);

    return (
      <div css={styles(theme)} className="qa-grid-container">
        <CategorySearchBar
          ref={searchRef}
          value={query}
          onChange={setQuery}
          placeholder="Search nodes..."
        />
        <div className="qa-tabs" role="tablist" aria-label="Node categories">
          {NODE_SUBCATEGORIES.map((sub) => (
            <button
              key={sub.id}
              role="tab"
              aria-selected={activeSubcategory === sub.id}
              className={`qa-tab ${activeSubcategory === sub.id ? "active" : ""}`}
              onClick={() => onSubcategoryChange(sub.id)}
              type="button"
            >
              {sub.icon}
              <span>{sub.label}</span>
            </button>
          ))}
        </div>
        <div className="qa-list">
          {nodes.length === 0 ? (
            <Text className="qa-empty">No matching nodes</Text>
          ) : (
            <SearchResultsPanel searchNodes={nodes} compact />
          )}
        </div>
      </div>
    );
  }
);

QuickAccessGrid.displayName = "QuickAccessGrid";

export default QuickAccessGrid;
