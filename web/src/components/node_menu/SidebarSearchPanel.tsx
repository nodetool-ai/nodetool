/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";

import { Text, Box } from "../ui_primitives";
import SearchInput from "../search/SearchInput";
import SearchResultsPanel from "./SearchResultsPanel";
import useNodeMenuStore from "../../stores/NodeMenuStore";

const styles = (theme: Theme) =>
  css({
    "&.sidebar-search": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      boxSizing: "border-box",
      minHeight: 0
    },
    ".sidebar-search-results": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".sidebar-search-hint": {
      padding: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      fontSize: theme.fontSizeSmall
    }
  });

/**
 * Compact search panel for the left sidebar's Search category. Just the
 * search input + a result list — the full namespace browser is too wide for
 * the ~280 px panel column.
 */
const SidebarSearchPanel = memo(() => {
  const theme = useTheme();
  const searchTerm = useNodeMenuStore((s) => s.searchTerm);
  const setSearchTerm = useNodeMenuStore((s) => s.setSearchTerm);
  const searchResults = useNodeMenuStore((s) => s.searchResults);

  return (
    <Box css={styles(theme)} className="sidebar-search">
      <SearchInput
        focusSearchInput={false}
        focusOnTyping={false}
        placeholder="Search for nodes..."
        debounceTime={30}
        maxWidth="100%"
        width="100%"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchResults={searchResults}
      />
      <div className="sidebar-search-results">
        {searchTerm.trim() === "" ? (
          <Text className="sidebar-search-hint">
            Type to search across all node types.
          </Text>
        ) : (
          <SearchResultsPanel searchNodes={searchResults} compact />
        )}
      </div>
    </Box>
  );
});

SidebarSearchPanel.displayName = "SidebarSearchPanel";

export default SidebarSearchPanel;
