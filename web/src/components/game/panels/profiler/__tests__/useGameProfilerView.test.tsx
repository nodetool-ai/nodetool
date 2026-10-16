import { act, renderHook } from "@testing-library/react";
import { createGameProfiler } from "../gameProfiler";
import { GAME_PROFILER_REFRESH_MS, useGameProfilerView } from "../useGameProfilerView";

it("publishes a delayed render after a paused single-step without another simulation step", () => {
  jest.useFakeTimers();
  const element = document.createElement("div");
  document.body.append(element);
  const profiler = createGameProfiler();
  const root = { current: element };
  const hook = renderHook(() => useGameProfilerView(profiler, root));
  try {
    act(() => {
      profiler.recordStep({ tick: 1 });
      jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
    });
    expect(Array.from(hook.result.current.view.live?.steps.tick ?? [])).toEqual([1]);
    expect(hook.result.current.view.live?.frames.drawCalls).toHaveLength(0);
    // The asynchronous renderer completes after the view has already observed the step.
    act(() => {
      profiler.recordRender({ drawCalls: 17, textureBytes: 4096, triangles: 12 }, 1000);
      jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
    });
    expect(Array.from(hook.result.current.view.live?.frames.drawCalls ?? [])).toEqual([17]);
    expect(Array.from(hook.result.current.view.live?.steps.tick ?? [])).toEqual([1]);
  } finally {
    hook.unmount();
    element.remove();
    jest.useRealTimers();
  }
});
