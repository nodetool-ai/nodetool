/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { Box } from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";

import { Text, ToolbarIconButton, Tooltip } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
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
    ".sidebar-search-toolbar": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
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
 * the ~280 px panel column. Provides a button to open the full floating
 * NodeMenu for deeper exploration (plan §7.5).
 */
const SidebarSearchPanel = memo(() => {
  const theme = useTheme();
  const searchTerm = useNodeMenuStore((s) => s.searchTerm);
  const setSearchTerm = useNodeMenuStore((s) => s.setSearchTerm);
  const searchResults = useNodeMenuStore((s) => s.searchResults);
  const openNodeMenu = useNodeMenuStore((s) => s.openNodeMenu);

  // Open the floating NodeMenu near the screen center so the namespace tree
  // is reachable for browsing-style exploration.
  const handleOpenFullMenu = useCallback(() => {
    openNodeMenu({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      centerOnScreen: true,
      searchTerm
    });
  }, [openNodeMenu, searchTerm]);

  return (
    <Box css={styles(theme)} className="sidebar-search">
      <div className="sidebar-search-toolbar">
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: 220 }}>
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
        </Box>
        <Tooltip
          title="Open full node menu"
          placement="bottom"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <ToolbarIconButton
            ariaLabel="Open full node menu"
            tabIndex={-1}
            onClick={handleOpenFullMenu}
            icon={<OpenInFullIcon />}
          />
        </Tooltip>
      </div>
      <div className="sidebar-search-results">
        {searchTerm.trim() === "" ? (
          <Text className="sidebar-search-hint">
            Type to search across all node types. Click the expand icon to
            open the full menu with the namespace tree.
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
