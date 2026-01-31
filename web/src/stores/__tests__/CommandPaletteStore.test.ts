/**
 * Tests for CommandPaletteStore
 */

import { renderHook, act } from "@testing-library/react";
import { useCommandPaletteStore } from "../CommandPaletteStore";

describe("CommandPaletteStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    const { commands } = useCommandPaletteStore.getState();
    commands.forEach((cmd) => {
      useCommandPaletteStore.getState().unregisterCommand(cmd.id);
    });
    useCommandPaletteStore.setState({
      isOpen: false,
      commands: [],
      searchQuery: ""
    });
  });

  describe("open/close/toggle", () => {
    it("should open the command palette", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should close the command palette", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.open();
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should toggle the command palette", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should reset search query when opening", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("test");
        result.current.close();
        result.current.open();
      });

      expect(result.current.searchQuery).toBe("");
    });
  });

  describe("registerCommand", () => {
    it("should register a new command", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      const testCommand = {
        id: "test.command",
        label: "Test Command",
        description: "A test command",
        action: jest.fn()
      };

      act(() => {
        result.current.registerCommand(testCommand);
      });

      expect(result.current.commands).toHaveLength(1);
      expect(result.current.commands[0]).toEqual(testCommand);
    });

    it("should update an existing command", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      const testCommand = {
        id: "test.command",
        label: "Test Command",
        action: jest.fn()
      };

      act(() => {
        result.current.registerCommand(testCommand);
        result.current.registerCommand({
          ...testCommand,
          label: "Updated Command"
        });
      });

      expect(result.current.commands).toHaveLength(1);
      expect(result.current.commands[0].label).toBe("Updated Command");
    });
  });

  describe("unregisterCommand", () => {
    it("should remove a command", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.registerCommand({
          id: "test.command",
          label: "Test Command",
          action: jest.fn()
        });
        result.current.unregisterCommand("test.command");
      });

      expect(result.current.commands).toHaveLength(0);
    });
  });

  describe("getFilteredCommands", () => {
    beforeEach(() => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.registerCommand({
          id: "nav.dashboard",
          label: "Go to Dashboard",
          description: "Navigate to the main dashboard",
          keywords: ["home", "dashboard"],
          category: "Navigation",
          action: jest.fn()
        });

        result.current.registerCommand({
          id: "workflow.new",
          label: "Create New Workflow",
          description: "Start a new workflow",
          keywords: ["new", "create"],
          category: "Workflow",
          action: jest.fn()
        });
      });
    });

    it("should return all commands when search is empty", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(2);
    });

    it("should filter commands by label", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("dashboard");
      });

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("nav.dashboard");
    });

    it("should filter commands by description", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("navigate");
      });

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("nav.dashboard");
    });

    it("should filter commands by keywords", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("create");
      });

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("workflow.new");
    });

    it("should filter commands by category", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("workflow");
      });

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("workflow.new");
    });

    it("should be case-insensitive", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.setSearchQuery("DASHBOARD");
      });

      const filtered = result.current.getFilteredCommands();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("nav.dashboard");
    });
  });

  describe("executeCommand", () => {
    it("should execute a command and close the palette", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      const mockAction = jest.fn();

      act(() => {
        result.current.registerCommand({
          id: "test.command",
          label: "Test Command",
          action: mockAction
        });
        result.current.open();
        result.current.executeCommand("test.command");
      });

      expect(mockAction).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it("should not throw when executing non-existent command", () => {
      const { result } = renderHook(() => useCommandPaletteStore());

      act(() => {
        result.current.open();
      });

      expect(() => {
        act(() => {
          result.current.executeCommand("nonexistent.command");
        });
      }).not.toThrow();
    });
  });
});
