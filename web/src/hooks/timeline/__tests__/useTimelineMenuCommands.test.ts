import { renderHook } from "@testing-library/react";
import type { ContextCommand } from "../../../stores/CommandMenuStore";
import { initKeyListeners, useKeyPressedStore } from "../../../stores/KeyPressedStore";
import { useTimelineMenuCommands } from "../useTimelineMenuCommands";

let mockCommands: ContextCommand[] = [];
jest.mock("../../useContextCommands", () => ({
  useContextCommands: (_heading: string, commands: ContextCommand[]) => {
    mockCommands = commands;
  }
}));
jest.mock("../../../stores/timeline/TimelineInstance", () => ({
  useTimelineIsActive: () => true
}));

describe("useTimelineMenuCommands", () => {
  it("releases the modifiers a replayed binding pressed", () => {
    const release = initKeyListeners();
    try {
      renderHook(() => useTimelineMenuCommands());
      const withModifier = mockCommands.filter((c) =>
        /Ctrl|⌘|Shift|⇧|Alt|⌥/.test(c.shortcut ?? "")
      );
      expect(withModifier.length).toBeGreaterThan(0);
      for (const command of withModifier) {
        command.run();
      }
      expect(useKeyPressedStore.getState().getPressedKeys()).toEqual([]);
    } finally {
      release();
    }
  });
});
