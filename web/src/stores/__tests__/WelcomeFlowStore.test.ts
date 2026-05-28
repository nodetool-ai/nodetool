import { act } from "@testing-library/react";
import { useWelcomeFlowStore } from "../WelcomeFlowStore";

describe("WelcomeFlowStore", () => {
  beforeEach(() => {
    act(() => {
      useWelcomeFlowStore.setState({ dismissed: false });
    });
    localStorage.removeItem("welcome-flow");
  });

  it("defaults to not dismissed", () => {
    expect(useWelcomeFlowStore.getState().dismissed).toBe(false);
  });

  it("dismiss() marks the flow dismissed and persists it", () => {
    act(() => {
      useWelcomeFlowStore.getState().dismiss();
    });

    expect(useWelcomeFlowStore.getState().dismissed).toBe(true);

    const persisted = JSON.parse(localStorage.getItem("welcome-flow") || "{}");
    expect(persisted.state.dismissed).toBe(true);
  });

  it("reset() restores the not-dismissed state", () => {
    act(() => {
      useWelcomeFlowStore.getState().dismiss();
    });
    act(() => {
      useWelcomeFlowStore.getState().reset();
    });

    expect(useWelcomeFlowStore.getState().dismissed).toBe(false);

    const persisted = JSON.parse(localStorage.getItem("welcome-flow") || "{}");
    expect(persisted.state.dismissed).toBe(false);
  });
});
