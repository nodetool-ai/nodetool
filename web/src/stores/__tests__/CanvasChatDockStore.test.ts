import useCanvasChatDockStore, {
  DEFAULT_OVERLAY_HEIGHT,
  MAX_DOCK_WIDTH,
  MAX_OVERLAY_HEIGHT,
  MIN_DOCK_WIDTH,
  MIN_OVERLAY_HEIGHT
} from "../CanvasChatDockStore";

const reset = () =>
  useCanvasChatDockStore.setState({
    position: { x: 0, y: 0 },
    overlayHeight: DEFAULT_OVERLAY_HEIGHT,
    dockWidth: null,
    conversationCollapsed: true,
    threadsOpen: false
  });

describe("CanvasChatDockStore", () => {
  beforeEach(reset);

  it("starts collapsed with the responsive default width", () => {
    const s = useCanvasChatDockStore.getState();
    expect(s.conversationCollapsed).toBe(true);
    expect(s.threadsOpen).toBe(false);
    expect(s.dockWidth).toBeNull();
    expect(s.overlayHeight).toBe(DEFAULT_OVERLAY_HEIGHT);
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

  it("clamps the overlay height into range", () => {
    const { setOverlayHeight } = useCanvasChatDockStore.getState();
    setOverlayHeight(10);
    expect(useCanvasChatDockStore.getState().overlayHeight).toBe(
      MIN_OVERLAY_HEIGHT
    );
    setOverlayHeight(99999);
    expect(useCanvasChatDockStore.getState().overlayHeight).toBe(
      MAX_OVERLAY_HEIGHT
    );
    setOverlayHeight(500);
    expect(useCanvasChatDockStore.getState().overlayHeight).toBe(500);
  });

  it("clamps the dock width and allows null for the default", () => {
    const { setDockWidth } = useCanvasChatDockStore.getState();
    setDockWidth(10);
    expect(useCanvasChatDockStore.getState().dockWidth).toBe(MIN_DOCK_WIDTH);
    setDockWidth(99999);
    expect(useCanvasChatDockStore.getState().dockWidth).toBe(MAX_DOCK_WIDTH);
    setDockWidth(640);
    expect(useCanvasChatDockStore.getState().dockWidth).toBe(640);
    setDockWidth(null);
    expect(useCanvasChatDockStore.getState().dockWidth).toBeNull();
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
