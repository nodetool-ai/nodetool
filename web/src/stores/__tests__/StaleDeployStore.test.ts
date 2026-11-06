import { useStaleDeployStore } from "../StaleDeployStore";

describe("StaleDeployStore", () => {
  beforeEach(() => {
    useStaleDeployStore.setState({
      open: false,
      reason: "update",
      dismissed: false
    });
  });

  it("opens with the given reason", () => {
    useStaleDeployStore.getState().show("chunk-error");
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(true);
    expect(state.reason).toBe("chunk-error");
    expect(state.dismissed).toBe(false);
  });

  it("dismiss closes the dialog and remembers the choice", () => {
    useStaleDeployStore.getState().show("update");
    useStaleDeployStore.getState().dismiss();
    const state = useStaleDeployStore.getState();
    expect(state.open).toBe(false);
    expect(state.dismissed).toBe(true);
  });
});
