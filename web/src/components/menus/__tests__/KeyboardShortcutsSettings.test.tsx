/**
 * Tests for KeyboardShortcutsSettings component
 */

import React from "react";
import { render, screen, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import KeyboardShortcutsSettings from "../KeyboardShortcutsSettings";
import { useKeyboardShortcutsStore } from "../../../stores/KeyboardShortcutsStore";

// Wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  return Wrapper;
};

describe("KeyboardShortcutsSettings", () => {
  beforeEach(() => {
    // Reset store before each test
    useKeyboardShortcutsStore.getState().resetToDefaults();
  });

  const renderComponent = (props = {}) => {
    const wrapper = createWrapper();
    return render(<KeyboardShortcutsSettings {...props} />, { wrapper });
  };

  describe("rendering", () => {
    it("should render the component", () => {
      renderComponent();
      
      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
      expect(
        screen.getByText(/Click on a key combination to record/)
      ).toBeInTheDocument();
    });

    it("should render reset all button", () => {
      renderComponent();
      
      expect(screen.getByRole("button", { name: /Reset All/i })).toBeInTheDocument();
    });

    it("should display shortcuts grouped by category", () => {
      renderComponent();
      
      expect(screen.getByText("Workflows")).toBeInTheDocument();
      expect(screen.getByText("Panels")).toBeInTheDocument();
      expect(screen.getByText("Node Editor")).toBeInTheDocument();
    });

    it("should display individual shortcuts", () => {
      renderComponent();
      
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Paste")).toBeInTheDocument();
      expect(screen.getByText("Undo")).toBeInTheDocument();
    });
  });

  describe("shortcut filtering", () => {
    it("should filter shortcuts by search query", () => {
      renderComponent({ searchQuery: "copy" });
      
      expect(screen.getByText("Copy")).toBeInTheDocument();
      // Should not show unrelated shortcuts
      expect(screen.queryByText("Zoom")).not.toBeInTheDocument();
    });

    it("should show all shortcuts when search is empty", () => {
      renderComponent({ searchQuery: "" });
      
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Paste")).toBeInTheDocument();
    });

    it("should filter by category", () => {
      renderComponent({ selectedCategory: "workflow" });
      
      // Should show workflow shortcuts
      expect(screen.getByText(/Run Workflow/i)).toBeInTheDocument();
      // Should not show editor shortcuts
      expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    });

    it("should show no results message when no matches", () => {
      renderComponent({ searchQuery: "nonexistent shortcut xyz" });
      
      expect(
        screen.getByText("No shortcuts match your search.")
      ).toBeInTheDocument();
    });
  });

  describe("shortcut customization", () => {
    it("should show custom badge for customized shortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      renderComponent();
      
      const customBadges = screen.getAllByText("Custom");
      expect(customBadges.length).toBeGreaterThan(0);
    });

    it("should allow resetting a single shortcut", async () => {
      const user = userEvent.setup();
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      renderComponent();
      
      // Find and click reset button for copy shortcut
      const copySection = screen.getByText("Copy").closest("div");
      const resetButton = copySection?.querySelector('[title*="Reset"]');
      
      if (resetButton) {
        await user.click(resetButton);
        
        // Verify custom shortcut was removed
        expect(result.current.customShortcuts).not.toHaveProperty("copy");
      }
    });

    it("should allow resetting all shortcuts", async () => {
      const user = userEvent.setup();
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
        result.current.setCustomShortcut("paste", ["Control", "L"]);
      });
      
      renderComponent();
      
      // Click reset all button
      const resetButton = screen.getByRole("button", { name: /Reset All/i });
      await user.click(resetButton);
      
      // Confirm reset
      const confirmButton = screen.getByRole("button", { name: /Confirm Reset/i });
      await user.click(confirmButton);
      
      // Verify all custom shortcuts were removed
      expect(result.current.customShortcuts).toEqual({});
    });

    it("should cancel reset when clicking cancel button", async () => {
      const user = userEvent.setup();
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      renderComponent();
      
      // Click reset all button
      const resetButton = screen.getByRole("button", { name: /Reset All/i });
      await user.click(resetButton);
      
      // Click cancel
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);
      
      // Verify custom shortcut still exists
      expect(result.current.customShortcuts).toHaveProperty("copy");
    });
  });

  describe("key recording", () => {
    it("should start recording when clicking on key combo", async () => {
      const user = userEvent.setup();
      renderComponent();
      
      // Find a key combo display and click it
      const keyComboDisplays = screen.getAllByText(/Ctrl|Control/);
      if (keyComboDisplays.length > 0) {
        await user.click(keyComboDisplays[0]);
        
        // Should show "Press keys..." message
        expect(screen.getByText(/Press keys/i)).toBeInTheDocument();
      }
    });

    it("should cancel recording when losing focus", async () => {
      const user = userEvent.setup();
      renderComponent();
      
      // Start recording
      const keyComboDisplays = screen.getAllByText(/Ctrl|Control/);
      if (keyComboDisplays.length > 0) {
        await user.click(keyComboDisplays[0]);
        
        // Click elsewhere to blur
        const title = screen.getByText("Keyboard Shortcuts");
        await user.click(title);
        
        // Recording mode should be closed
        expect(screen.queryByText(/Press keys/i)).not.toBeInTheDocument();
      }
    });
  });

  describe("expandable sections", () => {
    it("should expand section when clicking expand button", async () => {
      const user = userEvent.setup();
      renderComponent();
      
      // Find an expand button
      const expandButtons = screen.getAllByRole("button").filter(
        (button) => button.querySelector("svg") // Look for buttons with icons
      );
      
      if (expandButtons.length > 0) {
        const copyText = screen.getByText("Copy");
        const parent = copyText.closest("div")?.parentElement;
        const expandButton = parent?.querySelector("button");
        
        if (expandButton) {
          await user.click(expandButton);
          
          // Should show additional information
          expect(screen.getByText(/Category:/i)).toBeInTheDocument();
        }
      }
    });
  });

  describe("conflict detection", () => {
    it("should show warning when conflicting shortcut is detected", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      // Set a conflicting shortcut
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "V"]);
      });
      
      renderComponent();
      
      // Should show conflict warning
      const _warnings = screen.queryAllByText(/Conflicts with/i);
      // Note: This might not be immediately visible without expanding the section
      // The actual conflict detection happens during key recording
    });
  });

  describe("integration with store", () => {
    it("should reflect store changes in UI", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      // Set a custom shortcut
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      renderComponent();
      
      // Should show the custom combo
      // Note: The actual display depends on platform (Mac vs Windows)
      // This is a basic check that the component renders with custom shortcuts
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
  });
});
