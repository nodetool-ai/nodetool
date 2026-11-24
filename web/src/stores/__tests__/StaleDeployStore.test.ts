import { useStaleDeployStore } from "../StaleDeployStore";

describe("StaleDeployStore", () => {
  beforeEach(() => {
    useStaleDeployStore.setState(useStaleDeployStore.getInitialState());
  });

  it("starts closed, not dismissed, with the update reason", () => {
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(false);
    expect(state.dismissed).toBe(false);
    expect(state.reason).toBe("update");
  });

  it("show opens the dialog with the given reason", () => {
    useStaleDeployStore.getState().show("chunk-error");
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(true);
    expect(state.reason).toBe("chunk-error");
  });

  it("dismiss closes the dialog and records the choice", () => {
    useStaleDeployStore.getState().show("update");
    useStaleDeployStore.getState().dismiss();
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(false);
    expect(state.dismissed).toBe(true);
  });

  it("show after dismiss reopens without clearing dismissed", () => {
    useStaleDeployStore.getState().dismiss();
    useStaleDeployStore.getState().show("chunk-error");
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(true);
    expect(state.dismissed).toBe(true);
  });
});
