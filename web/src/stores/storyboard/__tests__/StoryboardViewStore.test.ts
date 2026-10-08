import {
  DEFAULT_CARD_SIZE,
  MAX_CARD_SIZE,
  MIN_CARD_SIZE,
  useStoryboardViewStore
} from "../StoryboardViewStore";

beforeEach(() => {
  useStoryboardViewStore.setState({ cardSize: DEFAULT_CARD_SIZE });
});

describe("StoryboardViewStore", () => {
  it("starts at the size the grid had before the slider", () => {
    expect(useStoryboardViewStore.getState().cardSize).toBe(DEFAULT_CARD_SIZE);
  });

  it("clamps the card size to the slider's range", () => {
    const { setCardSize } = useStoryboardViewStore.getState();
    setCardSize(4);
    expect(useStoryboardViewStore.getState().cardSize).toBe(MIN_CARD_SIZE);
    setCardSize(500);
    expect(useStoryboardViewStore.getState().cardSize).toBe(MAX_CARD_SIZE);
    setCardSize(Number.NaN);
    expect(useStoryboardViewStore.getState().cardSize).toBe(DEFAULT_CARD_SIZE);
    setCardSize(48);
    expect(useStoryboardViewStore.getState().cardSize).toBe(48);
  });
});
