import { useCallback } from "react";

type Results = { totalMatches: number; currentMatch: number };

export function useEditorActions(params: {
  setWordWrapEnabled: (updater: (prev: boolean) => boolean) => void;
  setFindReplaceVisible: (updater: (prev: boolean) => boolean) => void;
  setSearchResults: (results: Results) => void;

  undoFnRef: React.MutableRefObject<(() => void) | null>;
  redoFnRef: React.MutableRefObject<(() => void) | null>;
  formatCodeBlockFnRef: React.MutableRefObject<(() => void) | null>;
  findFnRef: React.MutableRefObject<((searchTerm: string) => Results) | null>;
  replaceFnRef: React.MutableRefObject<
    | ((searchTerm: string, replaceTerm: string, replaceAll?: boolean) => void)
    | null
  >;
  navigateFnRef: React.MutableRefObject<
    ((direction: "next" | "previous") => Results) | null
  >;
}) {
  const {
    setWordWrapEnabled,
    setFindReplaceVisible,
    setSearchResults,
    undoFnRef,
    redoFnRef,
    formatCodeBlockFnRef,
    findFnRef,
    replaceFnRef,
    navigateFnRef
  } = params;

  const handleUndo = useCallback(() => {
    undoFnRef.current?.();
  }, [undoFnRef]);

  const handleRedo = useCallback(() => {
    redoFnRef.current?.();
  }, [redoFnRef]);

  const handleToggleWordWrap = useCallback(() => {
    setWordWrapEnabled((prev) => !prev);
  }, [setWordWrapEnabled]);

  const handleFormatCodeBlock = useCallback(() => {
    formatCodeBlockFnRef.current?.();
  }, [formatCodeBlockFnRef]);

  const handleToggleFind = useCallback(() => {
    setFindReplaceVisible((prev) => !prev);
  }, [setFindReplaceVisible]);

  const handleFind = useCallback(
    (searchTerm: string) => {
      const results = findFnRef.current?.(searchTerm);
      if (results) setSearchResults(results);
    },
    [findFnRef, setSearchResults]
  );

  const handleReplace = useCallback(
    (searchTerm: string, replaceTerm: string, replaceAll?: boolean) => {
      replaceFnRef.current?.(searchTerm, replaceTerm, replaceAll);
    },
    [replaceFnRef]
  );

  const handleNavigateNext = useCallback(() => {
    const results = navigateFnRef.current?.("next");
    if (results) setSearchResults(results);
  }, [navigateFnRef, setSearchResults]);

  const handleNavigatePrevious = useCallback(() => {
    const results = navigateFnRef.current?.("previous");
    if (results) setSearchResults(results);
  }, [navigateFnRef, setSearchResults]);

  return {
    handleUndo,
    handleRedo,
    handleToggleWordWrap,
    handleFormatCodeBlock,
    handleToggleFind,
    handleFind,
    handleReplace,
    handleNavigateNext,
    handleNavigatePrevious
  } as const;
}



