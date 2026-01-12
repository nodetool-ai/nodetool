import useDocumentationPanelStore from "../../stores/DocumentationPanelStore";
import { renderHook, act } from "@testing-library/react";

describe("DocumentationPanelStore", () => {
  beforeEach(() => {
    useDocumentationPanelStore.setState({
      isVisible: false,
      isExpanded: true
    });
  });

  it("has correct initial state", () => {
    const { result } = renderHook(() => useDocumentationPanelStore());
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isExpanded).toBe(true);
  });

  it("can show the panel", () => {
    const { result } = renderHook(() => useDocumentationPanelStore());

    act(() => {
      result.current.actions.show();
    });

    expect(result.current.isVisible).toBe(true);
  });

  it("can hide the panel", () => {
    useDocumentationPanelStore.setState({ isVisible: true });

    const { result } = renderHook(() => useDocumentationPanelStore());

    act(() => {
      result.current.actions.hide();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it("can toggle the panel visibility", () => {
    const { result } = renderHook(() => useDocumentationPanelStore());

    expect(result.current.isVisible).toBe(false);

    act(() => {
      result.current.actions.toggle();
    });

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.actions.toggle();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it("can set expanded state", () => {
    const { result } = renderHook(() => useDocumentationPanelStore());

    act(() => {
      result.current.actions.setExpanded(false);
    });

    expect(result.current.isExpanded).toBe(false);

    act(() => {
      result.current.actions.setExpanded(true);
    });

    expect(result.current.isExpanded).toBe(true);
  });

  it("can toggle expanded state", () => {
    const { result } = renderHook(() => useDocumentationPanelStore());

    expect(result.current.isExpanded).toBe(true);

    act(() => {
      result.current.actions.toggleExpanded();
    });

    expect(result.current.isExpanded).toBe(false);

    act(() => {
      result.current.actions.toggleExpanded();
    });

    expect(result.current.isExpanded).toBe(true);
  });
});
