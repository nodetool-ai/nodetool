import useCanvasChatDockStore, {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_WINDOW_HEIGHT,
  MAX_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  defaultConversationCollapsed
} from "../CanvasChatDockStore";

const reset = () =>
  useCanvasChatDockStore.setState({
    position: { x: 0, y: 0 },
    windowWidth: DEFAULT_WINDOW_WIDTH,
    windowHeight: DEFAULT_WINDOW_HEIGHT,
    conversationCollapsed: true,
    threadsOpen: false
  });

describe("CanvasChatDockStore", () => {
  beforeEach(reset);

  describe("default open state", () => {
    const initialWidth = window.innerWidth;
    afterEach(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: initialWidth
      });
    });
    const setWidth = (width: number) =>
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width
      });

    it("starts closed in a 1024px wide window so the graph stays visible", () => {
      setWidth(1024);
      expect(defaultConversationCollapsed()).toBe(true);
    });

    it("starts open in a 1440px wide window", () => {
      setWidth(1440);
      expect(defaultConversationCollapsed()).toBe(false);
    });
  });

  it("persists the open state, position and size", () => {
    const s = useCanvasChatDockStore.getState();
    s.setConversationCollapsed(false);
    s.setPosition({ x: -40, y: 20 });
    s.setWindowWidth(500);
    s.setWindowHeight(700);
    const persisted = JSON.parse(
      localStorage.getItem("canvas-chat-dock") ?? "{}"
    );
    expect(persisted.state).toEqual({
      position: { x: -40, y: 20 },
      windowWidth: 500,
      windowHeight: 700,
      conversationCollapsed: false
    });
  });

  it("drops a v1 dock layout instead of applying it to the window", async () => {
    localStorage.setItem(
      "canvas-chat-dock",
      JSON.stringify({
        state: {
          position: { x: 300, y: -200 },
          overlayHeight: 900,
          dockWidth: 1100,
          composerCollapsed: true
        },
        version: 1
      })
    );
    await useCanvasChatDockStore.persist.rehydrate();
    const s = useCanvasChatDockStore.getState();
    expect(s.position).toEqual({ x: 0, y: 0 });
    expect(s.windowWidth).toBe(DEFAULT_WINDOW_WIDTH);
    expect(s.windowHeight).toBe(DEFAULT_WINDOW_HEIGHT);
  });

  it("stores and resets the drag position", () => {
    useCanvasChatDockStore.getState().setPosition({ x: 120, y: -40 });
    expect(useCanvasChatDockStore.getState().position).toEqual({
      x: 120,
      y: -40
    });
    useCanvasChatDockStore.getState().resetPosition();
    expect(useCanvasChatDockStore.getState().position).toEqual({ x: 0, y: 0 });
  });

  it("clamps the window height into range", () => {
    const { setWindowHeight } = useCanvasChatDockStore.getState();
    setWindowHeight(10);
    expect(useCanvasChatDockStore.getState().windowHeight).toBe(
      MIN_WINDOW_HEIGHT
    );
    setWindowHeight(99999);
    expect(useCanvasChatDockStore.getState().windowHeight).toBe(
      MAX_WINDOW_HEIGHT
    );
    setWindowHeight(500);
    expect(useCanvasChatDockStore.getState().windowHeight).toBe(500);
  });

  it("clamps the window width into range", () => {
    const { setWindowWidth } = useCanvasChatDockStore.getState();
    setWindowWidth(10);
    expect(useCanvasChatDockStore.getState().windowWidth).toBe(
      MIN_WINDOW_WIDTH
    );
    setWindowWidth(99999);
    expect(useCanvasChatDockStore.getState().windowWidth).toBe(
      MAX_WINDOW_WIDTH
    );
    setWindowWidth(640);
    expect(useCanvasChatDockStore.getState().windowWidth).toBe(640);
  });

  it("toggles the conversation and threads flags", () => {
    const { toggleConversation, toggleThreads } =
      useCanvasChatDockStore.getState();
    toggleConversation();
    expect(useCanvasChatDockStore.getState().conversationCollapsed).toBe(false);
    toggleConversation();
    expect(useCanvasChatDockStore.getState().conversationCollapsed).toBe(true);

    toggleThreads();
    expect(useCanvasChatDockStore.getState().threadsOpen).toBe(true);
    toggleThreads();
    expect(useCanvasChatDockStore.getState().threadsOpen).toBe(false);
  });
});
