/*
 * gets metadata filtered by selected types
 * returns search results with handleSearchResult(filteredData);
 */

/** @jsxImportSource @emotion/react */

import React, { useCallback, useEffect, useState } from "react";
import Fuse from "fuse.js";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchInput from "../search/SearchInput";

type SearchComponentProps = {
  metadata: NodeMetadata[];
  handleSearchResult: (filteredData: NodeMetadata[]) => void;
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  debounceTime?: number;
  setSearchTimeout?: number;
  placeholder?: string;
};

const SearchComponent: React.FC<SearchComponentProps> = ({
  metadata,
  handleSearchResult,
  focusSearchInput = true,
  focusOnTyping = false,
  debounceTime = 0,
  setSearchTimeout = 30,

  placeholder = "Search..."
}) => {
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const { searchTerm, setSearchTerm, setSelectedPath } = useNodeMenuStore(
    (state) => ({
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm,
      setSelectedPath: state.setSelectedPath
    })
  );

  const resetSearch = useCallback(() => {
    setSearchTerm("");
    setSelectedPath([]);
  }, [setSearchTerm, setSelectedPath]);

  const performSearch = useCallback(
    (searchTerm: string) => {
      if (searchTerm.length > 1) {
        const fuseOptions = {
          keys: [
            { name: "title", weight: 0.5 },
            { name: "namespace", weight: 0.3 },
            { name: "tags", weight: 0.2 }
          ],
          includeMatches: true,
          ignoreLocation: true,
          threshold: 0.2,
          distance: 100,
          shouldSort: true,
          includeScore: true,
          minMatchCharLength: 2,
          useExtendedSearch: true,
          tokenize: true,
          matchAllTokens: false
        };
        const entries = metadata.map((node) => {
          const lines = node.description.split("\n");
          const tags = lines.length > 1 ? lines[1].split(",") : [];
          return {
            title: node.title,
            node_type: node.node_type,
            tags: tags,
            metadata: node
          };
        });

        const fuse = new Fuse(entries, fuseOptions);

        const searchTermWords = Array.from(
          new Set(searchTerm.trim().split(" "))
        );

        const filteredData = searchTermWords.reduce(
          (acc: NodeMetadata[], word: string) => {
            const searchResults = fuse
              .search(word)
              .map((result) => result.item.metadata)
              .sort((a, b) => a.node_type.localeCompare(b.node_type));

            if (acc.length === 0) {
              return searchResults;
            } else {
              return [...acc, ...searchResults].filter(
                (v, i, a) => a.findIndex((t) => t.title === v.title) === i
              );
            }
          },
          [] as NodeMetadata[]
        );

        return filteredData;
      }
      return searchTerm.length === 0 ? metadata : [];
    },
    [metadata]
  );

  useEffect(() => {
    const filteredData = performSearch(localSearchTerm);
    setTimeout(() => {
      handleSearchResult(filteredData);
    }, 1);

    if (localSearchTerm.length <= 1) {
      resetSearch();
    }
  }, [localSearchTerm, handleSearchResult, performSearch, resetSearch]);

  const handleSearchChange = useCallback(
    (newSearchTerm: string) => {
      setLocalSearchTerm(newSearchTerm);
      setTimeout(() => {
        setSearchTerm(newSearchTerm);
      }, setSearchTimeout);
    },
    [setSearchTerm, setSearchTimeout]
  );

  const handleSearchClear = useCallback(() => {
    resetSearch();
  }, [resetSearch]);

  useEffect(() => {
    if (searchTerm !== localSearchTerm) {
      handleSearchChange(searchTerm);
    }
  }, [handleSearchChange, localSearchTerm, searchTerm]);

  return (
    <div className="search-container">
      <SearchInput
        value={searchTerm}
        onSearchChange={handleSearchChange}
        onSearchClear={handleSearchClear}
        focusSearchInput={focusSearchInput}
        focusOnTyping={focusOnTyping}
        debounceTime={debounceTime}
        placeholder={placeholder}
      />
    </div>
  );
};

export default SearchComponent;
