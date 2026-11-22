/** F62: a value drag auditions the last value even when the throttle suppressed it. */

import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow } from "@nodetool-ai/timeline";

import { dragAudition } from "../StepSequencerGrid";

it("plays the last suppressed value after the throttle window", () => {
  jest.useFakeTimers();
  try {
    const row = normalizePattern({ lengthSteps: 16, rows: [{ id: "k", assignment: { type: "note", pitch: 36 } } as StepRow] }).rows[0]!;
    const play = jest.fn();
    const hear = dragAudition(row, "velocity", play);
    hear(0, 40);
    jest.advanceTimersByTime(50);
    hear(0, 90);
    expect(play).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(play).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenLastCalledWith(row, 0, { velocity: 90 });
  } finally {
    jest.useRealTimers();
  }
});
