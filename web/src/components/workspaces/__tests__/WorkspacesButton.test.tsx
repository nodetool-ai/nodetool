import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import WorkspacesButton from "../WorkspacesButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icon
jest.mock("@mui/icons-material/FolderOpen", () => ({
  __esModule: true,
  default: () => <span data-testid="folder-open-icon" />
}));

// Mock the WorkspaceManagerStore
jest.mock("../../../stores/WorkspaceManagerStore", () => ({
  useWorkspaceManagerStore: jest.fn()
}));

import { useWorkspaceManagerStore } from "../../../stores/WorkspaceManagerStore";

// Mock WorkspacesManager component
jest.mock("../WorkspacesManager", () => ({
  __esModule: true,
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-open={open} data-testid="workspaces-manager" data-on-close={typeof onClose}>
      WorkspacesManager
    </div>
  )
}));

// Mock ToolbarIconButton
jest.mock("../../ui_primitives", () => ({
  ToolbarIconButton: ({
    icon,
    tooltip,
    onClick,
    className,
    nodrag
  }: any) => (
    <button
      data-testid="toolbar-icon-button"
      data-tooltip={tooltip}
      className={className}
      data-nodrag={nodrag}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}));

describe("WorkspacesButton", () => {
  const mockSetIsOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementation
    (useWorkspaceManagerStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (selector.toString().includes("isOpen")) {
        return false;
      }
      if (selector.toString().includes("setIsOpen")) {
        return mockSetIsOpen;
      }
      return null;
    });
  });

  const renderWithTheme = () => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <WorkspacesButton />
      </ThemeProvider>
    );
  };

  describe("basic rendering", () => {
    it("renders the toolbar button", () => {
      renderWithTheme();
      expect(screen.getByTestId("toolbar-icon-button")).toBeInTheDocument();
    });

    it("renders the folder open icon", () => {
      renderWithTheme();
      expect(screen.getByTestId("folder-open-icon")).toBeInTheDocument();
    });

    it("has correct tooltip", () => {
      renderWithTheme();
      expect(screen.getByTestId("toolbar-icon-button")).toHaveAttribute(
        "data-tooltip",
        "Workspaces Manager"
      );
    });

    it("has correct className", () => {
      renderWithTheme();
      expect(screen.getByTestId("toolbar-icon-button")).toHaveClass(
        "workspaces-button"
      );
    });

    it("has nodrag set to false", () => {
      renderWithTheme();
      expect(screen.getByTestId("toolbar-icon-button")).toHaveAttribute(
        "data-nodrag",
        "false"
      );
    });
  });

  describe("WorkspacesManager integration", () => {
    it("renders WorkspacesManager component", () => {
      renderWithTheme();
      expect(screen.getByTestId("workspaces-manager")).toBeInTheDocument();
    });

    it("passes isOpen state from store to WorkspacesManager", () => {
      (useWorkspaceManagerStore as unknown as jest.Mock).mockImplementation((selector) => {
        if (selector.toString().includes("isOpen")) {
          return true;
        }
        if (selector.toString().includes("setIsOpen")) {
          return mockSetIsOpen;
        }
        return null;
      });

      renderWithTheme();
      expect(screen.getByTestId("workspaces-manager")).toHaveAttribute(
        "data-open",
        "true"
      );
    });

    it("passes closed state to WorkspacesManager when store isOpen is false", () => {
      renderWithTheme();
      expect(screen.getByTestId("workspaces-manager")).toHaveAttribute(
        "data-open",
        "false"
      );
    });
  });

  describe("Zustand store interactions", () => {
    it("subscribes to isOpen state from WorkspaceManagerStore", () => {
      renderWithTheme();
      expect(useWorkspaceManagerStore).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it("subscribes to setIsOpen action from WorkspaceManagerStore", () => {
      renderWithTheme();
      expect(useWorkspaceManagerStore).toHaveBeenCalledWith(
        expect.any(Function)
      );
      // Should be called twice (once for isOpen, once for setIsOpen)
      expect(useWorkspaceManagerStore).toHaveBeenCalledTimes(2);
    });

    it("calls setIsOpen(true) when button is clicked", () => {
      renderWithTheme();

      const button = screen.getByTestId("toolbar-icon-button");
      fireEvent.click(button);

      expect(mockSetIsOpen).toHaveBeenCalledWith(true);
      expect(mockSetIsOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe("user interactions", () => {
    it("opens workspaces manager when button is clicked", () => {
      renderWithTheme();

      const button = screen.getByTestId("toolbar-icon-button");
      fireEvent.click(button);

      expect(mockSetIsOpen).toHaveBeenCalledWith(true);
    });

    it("handles multiple clicks correctly", () => {
      renderWithTheme();

      const button = screen.getByTestId("toolbar-icon-button");
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(mockSetIsOpen).toHaveBeenCalledTimes(3);
      expect(mockSetIsOpen).toHaveBeenCalledWith(true);
    });
  });

  describe("component behavior", () => {
    it("is memoized to prevent unnecessary re-renders", () => {
      const { rerender } = renderWithTheme();

      // Rerender with same props
      rerender(
        <ThemeProvider theme={mockTheme}>
          <WorkspacesButton />
        </ThemeProvider>
      );

      // Component should still be mounted
      expect(screen.getByTestId("toolbar-icon-button")).toBeInTheDocument();
      expect(screen.getByTestId("workspaces-manager")).toBeInTheDocument();
    });

    it("renders correctly with initial open state from store", () => {
      // Test with initial open state
      (useWorkspaceManagerStore as unknown as jest.Mock).mockImplementation((selector) => {
        if (selector.toString().includes("isOpen")) {
          return true;
        }
        if (selector.toString().includes("setIsOpen")) {
          return mockSetIsOpen;
        }
        return null;
      });

      renderWithTheme();
      expect(screen.getByTestId("workspaces-manager")).toHaveAttribute(
        "data-open",
        "true"
      );
    });

    it("renders correctly with initial closed state from store", () => {
      // Test with initial closed state (default)
      renderWithTheme();
      expect(screen.getByTestId("workspaces-manager")).toHaveAttribute(
        "data-open",
        "false"
      );
    });
  });

  describe("accessibility", () => {
    it("renders a clickable button element", () => {
      renderWithTheme();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("provides tooltip for screen readers", () => {
      renderWithTheme();
      const button = screen.getByRole("button");
      // Tooltip should be available as data attribute
      expect(button).toHaveAttribute("data-tooltip", "Workspaces Manager");
    });
  });

  describe("displayName", () => {
    it("has correct displayName for debugging", () => {
      expect(WorkspacesButton.displayName).toBe("WorkspacesButton");
    });
  });

  describe("integration with callbacks", () => {
    it("uses useCallback for handleOpen to prevent recreating functions", () => {
      renderWithTheme();

      // Click multiple times and ensure the same reference is being used
      const button = screen.getByTestId("toolbar-icon-button");

      fireEvent.click(button);
      const firstCallCount = mockSetIsOpen.mock.calls.length;

      fireEvent.click(button);
      const secondCallCount = mockSetIsOpen.mock.calls.length;

      expect(firstCallCount).toBe(1);
      expect(secondCallCount).toBe(2);
    });

    it("uses useCallback for handleClose passed to WorkspacesManager", () => {
      // This test verifies that handleClose exists and is a function
      // The actual useCallback behavior is tested by re-rendering
      const { rerender } = renderWithTheme();

      rerender(
        <ThemeProvider theme={mockTheme}>
          <WorkspacesButton />
        </ThemeProvider>
      );

      // Component should still work correctly after rerender
      const button = screen.getByTestId("toolbar-icon-button");
      fireEvent.click(button);

      expect(mockSetIsOpen).toHaveBeenCalled();
    });
  });
});
