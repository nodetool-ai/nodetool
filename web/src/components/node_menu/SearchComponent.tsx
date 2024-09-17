/*
 * gets metadata filtered by selected types
 * returns search results with handleSearchResult(filteredData);
 */

/** @jsxImportSource @emotion/react */

import React, { useEffect } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchInput from "../search/SearchInput";

type SearchComponentProps = {
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  debounceTime?: number;
  placeholder?: string;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
};

const SearchComponent: React.FC<SearchComponentProps> = ({
  focusSearchInput = true,
  focusOnTyping = false,
  debounceTime = 300,
  searchTerm,
  setSearchTerm,
  placeholder = "Search..."
}) => {
  const { performSearch, setSelectedPath } = useNodeMenuStore((state) => ({
    performSearch: state.performSearch,
    setSelectedPath: state.setSelectedPath
  }));

  return (
    <div className="search-container">
      <SearchInput
        focusSearchInput={focusSearchInput}
        focusOnTyping={focusOnTyping}
        placeholder={placeholder}
        debounceTime={debounceTime}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setSelectedPath={setSelectedPath}
      />
    </div>
  );
};

export default React.memo(SearchComponent);
