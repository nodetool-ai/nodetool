import { expect, it } from "vitest";
import { createNativePlayerInputRecording, stepWithNativeInputRecording } from "../src/native-cpp/player.js";

it("ordinary play does not retain history or stop at recording limits", async () => {
  const recording = createNativePlayerInputRecording({ maxTicks: 1, maxBytes: 1024 });
  let mutations = 0;
  for (let tick = 1; tick <= 3; tick++) {
    await stepWithNativeInputRecording(recording, { generation: 1, tick, input: { loaded: [] } }, async () => { mutations++; });
  }
  expect(recording).toBeUndefined();
  expect(mutations).toBe(3);
});

it("explicit recording stops before the first unrecordable mutation", async () => {
  const recording = createNativePlayerInputRecording({ enabled: true, maxTicks: 1, maxBytes: 1024 });
  let mutations = 0;
  const step = async (): Promise<void> => { mutations++; };
  await stepWithNativeInputRecording(recording, { generation: 1, tick: 1, input: { loaded: [] } }, step);
  await expect(stepWithNativeInputRecording(recording, { generation: 1, tick: 2, input: {} }, step)).rejects.toThrow("recording is full");
  expect(mutations).toBe(1);
  expect(recording?.entries()).toEqual([{ generation: 1, tick: 1, input: { loaded: [] } }]);
});
