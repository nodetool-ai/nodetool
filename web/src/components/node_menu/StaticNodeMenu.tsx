/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo, useRef } from "react";
import { IconButton, Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

// components
import TypeFilter from "./TypeFilter";
import NamespaceList from "./NamespaceList";
import SearchInput from "../search/SearchInput";

// store
import useNodeMenuStore from "../../stores/NodeMenuStore";

// theme
import ThemeNodetool from "../themes/ThemeNodetool";
import useNamespaceTree from "../../hooks/useNamespaceTree";
import { useCombo } from "../../stores/KeyPressedStore";

const staticMenuStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%", // Changed to 100% for static layout
      width: "100%" // Added full width
      //   overflow: "hidden"
    }
  });

type StaticNodeMenuProps = {
  className?: string;
};

export default function StaticNodeMenu({ className }: StaticNodeMenuProps) {
  const containerRef = useRef(null);
  const namespaceTree = useNamespaceTree();

  const { searchResults, searchTerm, setSearchTerm } = useNodeMenuStore(
    (state) => ({
      searchResults: state.searchResults,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm
    })
  );

  const memoizedStyles = useMemo(() => staticMenuStyles(ThemeNodetool), []);

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
          debounceTime={300}
          maxWidth={"400px"}
          width={200}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchResults={searchResults}
        />
        <Box>
          <NamespaceList
            namespaceTree={namespaceTree}
            metadata={searchResults}
          />
        </Box>
      </Box>
    </Box>
  );
}