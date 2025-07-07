/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";

// components
import NamespaceList from "./NamespaceList";
import SearchInput from "../search/SearchInput";

// store
import useNodeMenuStore from "../../stores/NodeMenuStore";

// theme
import useNamespaceTree from "../../hooks/useNamespaceTree";

const staticMenuStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%"
    }
  });

type StaticNodeMenuProps = {
  className?: string;
};

function StaticNodeMenu({ className }: StaticNodeMenuProps) {
  const containerRef = useRef(null);
  const namespaceTree = useNamespaceTree();

  const { searchResults, searchTerm, setSearchTerm } = useNodeMenuStore(
    (state) => ({
      searchResults: state.searchResults,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm
    })
  );

  const theme = useTheme();
  const memoizedStyles = useMemo(() => staticMenuStyles(theme), [theme]);

  return (
    <Box
      className={`static-node-menu ${className || ""}`}
      css={memoizedStyles}
      ref={containerRef}
    >
      <Box className="search-toolbar">
        <SearchInput
          focusSearchInput={false}
          focusOnTyping={false}
          placeholder="Search for nodes..."
          debounceTime={30}
          maxWidth={"400px"}
          width={200}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchResults={searchResults}
        />
      </Box>
      <Box>
        <NamespaceList namespaceTree={namespaceTree} metadata={searchResults} />
      </Box>
    </Box>
  );
}

export default memo(StaticNodeMenu);
