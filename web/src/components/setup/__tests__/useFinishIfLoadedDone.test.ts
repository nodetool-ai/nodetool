import { renderHook } from "@testing-library/react";
import { useFinishIfLoadedDone } from "../useFinishIfLoadedDone";

// A tab reloaded after its flow wrote `done` has no step left to finish it.
it("finishes a host whose document loaded already done", () => {
  const onFinish = jest.fn();
  const { rerender } = renderHook(
    ({ loaded, stage }) => useFinishIfLoadedDone(loaded, stage, onFinish),
    { initialProps: { loaded: false, stage: "done" } }
  );
  expect(onFinish).not.toHaveBeenCalled();

  rerender({ loaded: true, stage: "done" });
  rerender({ loaded: true, stage: "done" });

  expect(onFinish).toHaveBeenCalledTimes(1);
});

// A flow that reaches `done` while it is up is finished by the step that
// wrote it, not a second time from here.
it("leaves a document that reaches done while the host is up", () => {
  const onFinish = jest.fn();
  const { rerender } = renderHook(
    ({ stage }) => useFinishIfLoadedDone(true, stage, onFinish),
    { initialProps: { stage: "look" } }
  );

  rerender({ stage: "done" });

  expect(onFinish).not.toHaveBeenCalled();
});
