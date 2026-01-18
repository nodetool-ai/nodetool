import { useKeyPressedStore } from "../KeyPressedStore";

describe("KeyPressedStore", () => {
  beforeEach(() => {
    useKeyPressedStore.setState({
      pressedKeys: new Set(),
      lastPressedKey: null,
      keyPressCount: {},
      isPaused: false
    });
  });

  it("initializes with empty pressed keys", () => {
    const state = useKeyPressedStore.getState();
    expect(state.pressedKeys.size).toBe(0);
    expect(state.lastPressedKey).toBeNull();
    expect(state.keyPressCount).toEqual({});
  });

  it("sets keys pressed state", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.pressedKeys.has("a")).toBe(true);
  });

  it("sets multiple keys pressed", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "control": true, "c": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.pressedKeys.has("control")).toBe(true);
    expect(newState.pressedKeys.has("c")).toBe(true);
  });

  it("clears keys on key release", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true });
    
    const stateWithA = useKeyPressedStore.getState();
    expect(stateWithA.pressedKeys.has("a")).toBe(true);

    state.setKeysPressed({ "a": false });
    
    const stateWithoutA = useKeyPressedStore.getState();
    expect(stateWithoutA.pressedKeys.has("a")).toBe(false);
  });

  it("normalizes keys to lowercase", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "A": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.pressedKeys.has("a")).toBe(true);
  });

  it("tracks key press count", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true });
    state.setKeysPressed({ "a": false });
    state.setKeysPressed({ "a": true });

    const newState = useKeyPressedStore.getState();
    expect(newState.keyPressCount["a"]).toBe(2);
  });

  it("checks if key is pressed", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.isKeyPressed("a")).toBe(true);
    expect(newState.isKeyPressed("b")).toBe(false);
  });

  it("checks if any key is pressed", () => {
    const state = useKeyPressedStore.getState();
    expect(state.isAnyKeyPressed()).toBe(false);

    state.setKeysPressed({ "a": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.isAnyKeyPressed()).toBe(true);
  });

  it("gets pressed keys array", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true, "b": true });
    
    const newState = useKeyPressedStore.getState();
    const keys = newState.getPressedKeys();
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });

  it("gets key press count", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.getKeyPressCount("a")).toBe(1);
    expect(newState.getKeyPressCount("b")).toBe(0);
  });

  it("resets key press count for specific key", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true, "b": true });
    state.resetKeyPressCount("a");

    const newState = useKeyPressedStore.getState();
    expect(newState.keyPressCount["a"]).toBeUndefined();
    expect(newState.keyPressCount["b"]).toBe(1);
  });

  it("resets all key press counts", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "a": true, "b": true });
    state.resetKeyPressCount();

    const newState = useKeyPressedStore.getState();
    expect(newState.keyPressCount).toEqual({});
  });

  it("checks if combo is pressed", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "control": true, "c": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.isComboPressed(["control", "c"])).toBe(true);
    expect(newState.isComboPressed(["control", "d"])).toBe(false);
  });

  it("checks combo with partial keys", () => {
    const state = useKeyPressedStore.getState();
    state.setKeysPressed({ "control": true });
    
    const newState = useKeyPressedStore.getState();
    expect(newState.isComboPressed(["control", "c"])).toBe(false);
  });

  it("pauses and resumes key tracking", () => {
    const state = useKeyPressedStore.getState();
    state.setPaused(true);
    
    const pausedState = useKeyPressedStore.getState();
    expect(pausedState.isPaused).toBe(true);

    pausedState.setPaused(false);
    
    const resumedState = useKeyPressedStore.getState();
    expect(resumedState.isPaused).toBe(false);
  });
});
