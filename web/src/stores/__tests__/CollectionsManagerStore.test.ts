import { act } from "@testing-library/react";
import { useCollectionsManagerStore } from "../CollectionsManagerStore";

describe("CollectionsManagerStore", () => {
  beforeEach(() => {
    useCollectionsManagerStore.setState(useCollectionsManagerStore.getInitialState());
  });

  afterEach(() => {
    useCollectionsManagerStore.setState(useCollectionsManagerStore.getInitialState());
  });

  it("initializes with isOpen set to false", () => {
    expect(useCollectionsManagerStore.getState().isOpen).toBe(false);
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

  it("handles multiple setIsOpen operations", () => {
    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(true);
      useCollectionsManagerStore.getState().setIsOpen(false);
      useCollectionsManagerStore.getState().setIsOpen(true);
    });

    expect(useCollectionsManagerStore.getState().isOpen).toBe(true);
  });

  it("preserves state across multiple calls", () => {
    expect(useCollectionsManagerStore.getState().isOpen).toBe(false);

    act(() => {
      useCollectionsManagerStore.getState().setIsOpen(true);
    });

    expect(useCollectionsManagerStore.getState().isOpen).toBe(true);
  });
});
