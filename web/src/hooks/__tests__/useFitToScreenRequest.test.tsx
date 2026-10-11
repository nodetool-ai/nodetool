import React from "react";
import { act, renderHook } from "@testing-library/react";
import { create } from "zustand";
import { useFitToScreenRequest } from "../useFitToScreenRequest";

interface FitState {
  shouldFitToScreen: boolean;
  setShouldFitToScreen: (value: boolean) => void;
}

const makeStore = () =>
  create<FitState>((set) => ({
    shouldFitToScreen: true,
    setShouldFitToScreen: (value) => set({ shouldFitToScreen: value })
  }));

const renderFit = (
  store: ReturnType<typeof makeStore>,
  fitView: () => void,
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
) =>
  renderHook(
    () => {
      const shouldFit = store((state) => state.shouldFitToScreen);
      useFitToScreenRequest(
        shouldFit,
        store as unknown as Parameters<typeof useFitToScreenRequest>[1],
        fitView
      );
    },
    { wrapper }
  );

describe("useFitToScreenRequest", () => {
  // QA round 7: the first node added to a blank workflow opened at 400%.
  it("drops the store's initial request under StrictMode", () => {
    const store = makeStore();
    const fitView = jest.fn();
    renderFit(store, fitView, React.StrictMode);

    expect(fitView).not.toHaveBeenCalled();
    expect(store.getState().shouldFitToScreen).toBe(false);
  });

  it("fits on a later request", () => {
    const store = makeStore();
    const fitView = jest.fn();
    renderFit(store, fitView, React.StrictMode);

    act(() => store.getState().setShouldFitToScreen(true));
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(store.getState().shouldFitToScreen).toBe(false);
  });
});
