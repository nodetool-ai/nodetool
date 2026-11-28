import {
  GAME_KICKOFF_MAX_AGE_MS,
  useGameAssistantKickoffStore
} from "../GameAssistantKickoffStore";

const store = () => useGameAssistantKickoffStore.getState();

beforeEach(() => {
  jest.useRealTimers();
  useGameAssistantKickoffStore.setState({ kickoffs: {} });
});

describe("GameAssistantKickoffStore", () => {
  it("hands the prompt to the first claim only", () => {
    store().queue("game-1", "Finish the game");

    expect(store().claim("game-1")).toBe("Finish the game");
    expect(store().claim("game-1")).toBeNull();
  });

  it("keeps each game's prompt apart", () => {
    store().queue("game-1", "one");
    store().queue("game-2", "two");

    expect(store().claim("game-2")).toBe("two");
    expect(store().claim("game-1")).toBe("one");
  });

  it("drops a prompt older than a day instead of sending it", () => {
    jest.useFakeTimers({ now: 1_000 });
    store().queue("game-1", "Finish the game");
    jest.setSystemTime(1_000 + GAME_KICKOFF_MAX_AGE_MS);

    expect(store().claim("game-1")).toBeNull();
    expect(store().kickoffs).toEqual({});
  });
});
