import { renderHook, act } from "@testing-library/react";
import { useRef, useState } from "react";
import { useEditorActions } from "../useEditorActions";

function setup() {
  const undo = jest.fn();
  const redo = jest.fn();
  const format = jest.fn();
  const find = jest.fn((term: string) => ({
    totalMatches: 3,
    currentMatch: 1
  }));
  const replace = jest.fn();
  const navigate = jest.fn((dir: "next" | "previous") => ({
    totalMatches: 3,
    currentMatch: dir === "next" ? 2 : 1
  }));

  const undoFnRef = { current: undo } as any;
  const redoFnRef = { current: redo } as any;
  const formatCodeBlockFnRef = { current: format } as any;
  const findFnRef = { current: find } as any;
  const replaceFnRef = { current: replace } as any;
  const navigateFnRef = { current: navigate } as any;

  return {
    undo,
    redo,
    format,
    find,
    replace,
    navigate,
    undoFnRef,
    redoFnRef,
    formatCodeBlockFnRef,
    findFnRef,
    replaceFnRef,
    navigateFnRef
  };
}

describe("useEditorActions", () => {
  test("invokes editor action callbacks and updates search results", () => {
    const helpers = setup();
    const { result } = renderHook(() => {
      const [wrap, setWrap] = useState(true);
      const [visible, setVisible] = useState(false);
      const [results, setResults] = useState({
        totalMatches: 0,
        currentMatch: 0
      });
      return {
        state: { wrap, visible, results },
        actions: useEditorActions({
          setWordWrapEnabled: setWrap as any,
          setFindReplaceVisible: setVisible as any,
          setSearchResults: setResults,
          undoFnRef: helpers.undoFnRef,
          redoFnRef: helpers.redoFnRef,
          formatCodeBlockFnRef: helpers.formatCodeBlockFnRef,
          findFnRef: helpers.findFnRef,
          replaceFnRef: helpers.replaceFnRef,
          navigateFnRef: helpers.navigateFnRef
        })
      };
    });

    act(() => {
      result.current.actions.handleUndo();
      result.current.actions.handleRedo();
      result.current.actions.handleFormatCodeBlock();
      result.current.actions.handleToggleWordWrap();
      result.current.actions.handleToggleFind();
      result.current.actions.handleFind("foo");
      result.current.actions.handleReplace("a", "b", true);
      result.current.actions.handleNavigateNext();
      result.current.actions.handleNavigatePrevious();
    });

    expect(helpers.undo).toHaveBeenCalled();
    expect(helpers.redo).toHaveBeenCalled();
    expect(helpers.format).toHaveBeenCalled();
    expect(helpers.find).toHaveBeenCalledWith("foo");
    expect(helpers.replace).toHaveBeenCalledWith("a", "b", true);
    expect(helpers.navigate).toHaveBeenCalledWith("next");
    expect(helpers.navigate).toHaveBeenCalledWith("previous");
    expect(result.current.state.results.totalMatches).toBe(3);
  });
});





