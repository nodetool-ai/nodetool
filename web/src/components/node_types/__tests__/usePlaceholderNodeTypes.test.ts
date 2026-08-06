import { renderHook } from "@testing-library/react";
import { act } from "react";
import useMetadataStore from "../../../stores/MetadataStore";
import { usePlaceholderNodeTypes } from "../usePlaceholderNodeTypes";

const BaseNode = () => null;

describe("usePlaceholderNodeTypes", () => {
  beforeEach(() => {
    useMetadataStore.setState({ nodeTypes: {}, unknownNodeTypes: [] });
  });

  it("maps types the registry does not know", () => {
    act(() => {
      useMetadataStore.getState().addUnknownNodeTypes(["some.Gone"]);
    });
    const { result } = renderHook(() => usePlaceholderNodeTypes());
    expect(Object.keys(result.current)).toEqual(["some.Gone"]);
  });

  it("stops shadowing a type once the registry loads it", () => {
    // Regression: a graph opened before metadata arrived recorded every type as
    // unknown, and the append-only set kept rendering placeholders over the
    // real node bodies for the rest of the session.
    act(() => {
      useMetadataStore
        .getState()
        .addUnknownNodeTypes(["nodetool.input.DocumentInput"]);
    });
    const { result, rerender } = renderHook(() => usePlaceholderNodeTypes());
    expect(Object.keys(result.current)).toEqual([
      "nodetool.input.DocumentInput"
    ]);

    act(() => {
      useMetadataStore
        .getState()
        .setNodeTypes({ "nodetool.input.DocumentInput": BaseNode });
    });
    rerender();

    expect(Object.keys(result.current)).toEqual([]);
  });
});
