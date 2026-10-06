import { GAME_REPLAY_HISTORY_LIMIT, GameReplayHistory } from "../gameReplayHistory";

it("replays from a checkpoint after wrapping the input ring repeatedly", () => {
  const history = new GameReplayHistory<number, number>();
  let state = 0;
  for (let index = 0; index < GAME_REPLAY_HISTORY_LIMIT * 3; index++) {
    history.record(1, () => state);
    state++;
  }
  const replay = history.replay();
  expect(replay.inputs.length).toBeLessThanOrEqual(GAME_REPLAY_HISTORY_LIMIT);
  expect(replay.snapshot! + replay.inputs.reduce((sum, input) => sum + input, 0)).toBe(state);
  history.clear(40);
  history.record(2, () => 40);
  expect(history.replay()).toEqual({ snapshot: 40, inputs: [2] });
});
