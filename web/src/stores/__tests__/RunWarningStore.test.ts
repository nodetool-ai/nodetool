import { useRunWarningStore } from "../RunWarningStore";

const reset = () =>
  useRunWarningStore.setState({
    open: false,
    heavyCount: 0,
    threshold: 0,
    suppressedThisSession: false,
    onConfirm: null
  });

describe("RunWarningStore", () => {
  beforeEach(reset);

  it("opens with the supplied count/threshold", () => {
    useRunWarningStore.getState().requestConfirmation({
      heavyCount: 12,
      threshold: 5,
      onConfirm: jest.fn()
    });
    const s = useRunWarningStore.getState();
    expect(s.open).toBe(true);
    expect(s.heavyCount).toBe(12);
    expect(s.threshold).toBe(5);
  });

  it("runs onConfirm, closes, and remembers session suppression", () => {
    const onConfirm = jest.fn();
    useRunWarningStore
      .getState()
      .requestConfirmation({ heavyCount: 12, threshold: 5, onConfirm });

    useRunWarningStore.getState().confirm(true);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const s = useRunWarningStore.getState();
    expect(s.open).toBe(false);
    expect(s.suppressedThisSession).toBe(true);
  });

  it("confirm(false) runs onConfirm without suppressing", () => {
    const onConfirm = jest.fn();
    useRunWarningStore
      .getState()
      .requestConfirmation({ heavyCount: 8, threshold: 5, onConfirm });

    useRunWarningStore.getState().confirm(false);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useRunWarningStore.getState().suppressedThisSession).toBe(false);
  });

  it("cancel closes without running onConfirm", () => {
    const onConfirm = jest.fn();
    useRunWarningStore
      .getState()
      .requestConfirmation({ heavyCount: 8, threshold: 5, onConfirm });

    useRunWarningStore.getState().cancel();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useRunWarningStore.getState().open).toBe(false);
  });
});
