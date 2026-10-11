import { createGamePanelRegistry, gamePanelRegistry, type GamePanelRegistration } from "../panelRegistry";

const panel: GamePanelRegistration = {
  id: "extension", title: "Extension", icon: null, dimensions: ["2d"], defaultRegion: "right"
};

it("publishes stable snapshots only for successful registry changes", () => {
  const registry = createGamePanelRegistry();
  const listener = jest.fn();
  const unsubscribe = registry.subscribe(listener);
  const empty = registry.getSnapshot();
  expect(registry.getSnapshot()).toBe(empty);
  const dispose = registry.register(panel);
  const registered = registry.getSnapshot();
  expect(registered).not.toBe(empty);
  expect(registered).toEqual([panel]);
  expect(registry.getSnapshot()).toBe(registered);
  expect(registry.panels("2d")).toEqual([panel]);
  expect(registry.panels("3d")).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(() => registry.register({ ...panel })).toThrow("already registered");
  expect(registry.getSnapshot()).toBe(registered);
  expect(listener).toHaveBeenCalledTimes(1);
  dispose();
  const disposed = registry.getSnapshot();
  expect(disposed).toEqual([]);
  expect(disposed).not.toBe(registered);
  expect(listener).toHaveBeenCalledTimes(2);
  dispose();
  expect(registry.getSnapshot()).toBe(disposed);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  registry.register(panel);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(registry.getSnapshot()).toEqual([panel]);
});

it("owns immutable registration metadata independently of its caller", () => {
  const registry = createGamePanelRegistry();
  const dimensions: Array<"2d" | "3d"> = ["2d"];
  const supplied = { ...panel, dimensions };
  const listener = jest.fn();
  registry.subscribe(listener);
  const dispose = registry.register(supplied);
  supplied.id = "changed-id";
  supplied.title = "Changed externally";
  dimensions.push("3d");
  expect(registry.getSnapshot()[0].title).toBe("Extension");
  expect(registry.panels("3d")).toEqual([]);
  expect(registry.getSnapshot()[0].id).toBe("extension");
  expect(Object.isFrozen(registry.getSnapshot()[0])).toBe(true);
  expect(Object.isFrozen(registry.getSnapshot()[0].dimensions)).toBe(true);
  dispose();
  expect(registry.getSnapshot()).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("registers the console panel in the bottom region for 2D and 3D", () => {
  for (const dimension of ["2d", "3d"] as const) {
    expect(gamePanelRegistry.panels(dimension).find((entry) => entry.id === "console"))
      .toMatchObject({ title: "Console", defaultRegion: "bottom" });
  }
});
