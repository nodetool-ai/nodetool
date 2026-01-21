import { act } from "@testing-library/react";
import { useCollectionsManagerStore } from "../CollectionsManagerStore";

describe("CollectionsManagerStore", () => {
  beforeEach(() => {
    useCollectionsManagerStore.setState({
      isOpen: false
    });
  });

  afterEach(() => {
    useCollectionsManagerStore.setState({
      isOpen: false
    });
  });

  it("initializes with isOpen set to false", () => {
    const state = useCollectionsManagerStore.getState();
    expect(state.isOpen).toBe(false);
  });

  it("sets isOpen to true", () => {
    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(true);
    });

    expect(useCollectionsManagerStore.getState().isOpen).toBe(true);
  });

  it("sets isOpen to false", () => {
    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(true);
      useCollectionsManagerStore.getState().setIsOpen(false);
    });

    expect(useCollectionsManagerStore.getState().isOpen).toBe(false);
  });

  it("toggles isOpen state", () => {
    expect(useCollectionsManagerStore.getState().isOpen).toBe(false);

    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(true);
    });
    expect(useCollectionsManagerStore.getState().isOpen).toBe(true);

    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(false);
    });
    expect(useCollectionsManagerStore.getState().isOpen).toBe(false);
  });
});
