import { createDockPanelRegistry } from "../panelRegistry";

it("publishes a new frozen snapshot on each registration and removal, and rejects duplicates", () => {
  const registry = createDockPanelRegistry("demo");
  const listener = jest.fn();
  registry.subscribe(listener);
  const empty = registry.getSnapshot();
  const remove = registry.register({ id: "tracks", title: "Tracks", icon: null, defaultRegion: "bottom" });
  expect(registry.getSnapshot()).not.toBe(empty);
  expect(Object.isFrozen(registry.getSnapshot())).toBe(true);
  expect(() => registry.register({ id: "tracks", title: "Again", icon: null, defaultRegion: "bottom" })).toThrow("Demo panel tracks is already registered");
  remove();
  expect(registry.getSnapshot()).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(2);
});
