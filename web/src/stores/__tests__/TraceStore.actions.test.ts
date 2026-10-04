import { act, renderHook } from "@testing-library/react";
import { useRunInspection } from "../../hooks/useRunInspection";
import useTraceStore from "../TraceStore";
import { useBottomPanelStore } from "../BottomPanelStore";

beforeEach(() => {
  useTraceStore.getState().clear();
  useBottomPanelStore.getState().closePanel();
});

it("opens the bottom panel on the linked span and preserves the selection across views", () => {
  const { result } = renderHook(() => useRunInspection());
  act(() => result.current.openRunInspection({ runId: "a".repeat(32), spanId: "b".repeat(16), view: "logs" }));
  expect(result.current.selectedRunId).toBe("a".repeat(32));
  expect(result.current.focusedSpanId).toBe("b".repeat(16));
  expect(useBottomPanelStore.getState().panel).toMatchObject({ isVisible: true, activeView: "logs" });
  act(() => result.current.openRunInspection({ runId: "c".repeat(32) }));
  expect(result.current.focusedSpanId).toBeNull();
  expect(useBottomPanelStore.getState().panel.activeView).toBe("trace");
});
