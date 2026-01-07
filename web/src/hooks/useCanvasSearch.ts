import { useCallback, useEffect } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import useCanvasSearchStore, {
  SearchResult
} from "../stores/CanvasSearchStore";
import { Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { NodeStoreState } from "../stores/NodeStore";

export const useCanvasSearch = () => {
  const nodes = useNodes((state: NodeStoreState) => state.nodes);

  const {
    isSearchOpen,
    setIsSearchOpen,
    searchTerm,
    setSearchTerm,
    searchResults,
    selectedResultIndex,
    setSelectedResultIndex,
    highlightedNodeIds,
    clearSearch,
    performSearch
  } = useStoreWithEqualityFn(
    useCanvasSearchStore,
    (state) => ({
      isSearchOpen: state.isSearchOpen,
      setIsSearchOpen: state.setIsSearchOpen,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm,
      searchResults: state.searchResults,
      selectedResultIndex: state.selectedResultIndex,
      setSelectedResultIndex: state.setSelectedResultIndex,
      highlightedNodeIds: state.highlightedNodeIds,
      clearSearch: state.clearSearch,
      performSearch: state.performSearch
    }),
    shallow
  );

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
    setSearchTerm("");
  }, [setIsSearchOpen, setSearchTerm]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    clearSearch();
  }, [setIsSearchOpen, clearSearch]);

  const handleSearchTermChange = useCallback(
    (term: string) => {
      setSearchTerm(term);
      performSearch(nodes, term);
    },
    [setSearchTerm, performSearch, nodes]
  );

  const moveSelectionUp = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex =
      selectedResultIndex <= 0
        ? searchResults.length - 1
        : selectedResultIndex - 1;
    setSelectedResultIndex(newIndex);
  }, [searchResults, selectedResultIndex, setSelectedResultIndex]);

  const moveSelectionDown = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex =
      selectedResultIndex >= searchResults.length - 1 ? 0 : selectedResultIndex + 1;
    setSelectedResultIndex(newIndex);
  }, [searchResults, selectedResultIndex, setSelectedResultIndex]);

  const getSelectedResult = useCallback((): SearchResult | null => {
    if (selectedResultIndex < 0 || selectedResultIndex >= searchResults.length) {
      return null;
    }
    return searchResults[selectedResultIndex];
  }, [searchResults, selectedResultIndex]);

  const selectNextResult = useCallback(() => {
    moveSelectionDown();
  }, [moveSelectionDown]);

  const selectPreviousResult = useCallback(() => {
    moveSelectionUp();
  }, [moveSelectionUp]);

  useEffect(() => {
    if (isSearchOpen && searchTerm.trim()) {
      performSearch(nodes, searchTerm);
    }
  }, [isSearchOpen, searchTerm, nodes, performSearch]);

  return {
    isSearchOpen,
    openSearch,
    closeSearch,
    searchTerm,
    handleSearchTermChange,
    searchResults,
    selectedResultIndex,
    setSelectedResultIndex,
    moveSelectionUp,
    moveSelectionDown,
    getSelectedResult,
    selectNextResult,
    selectPreviousResult,
    highlightedNodeIds
  };
};

export default useCanvasSearch;
