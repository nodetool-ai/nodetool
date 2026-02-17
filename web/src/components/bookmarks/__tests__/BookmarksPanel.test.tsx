/**
 * Tests for BookmarksPanel component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import BookmarksPanel from "../BookmarksPanel";
import { useNodeBookmarksStore } from "../../../stores/NodeBookmarksStore";
import { ReactFlowProvider } from "@xyflow/react";

// Mock the store
jest.mock("../../../stores/NodeBookmarksStore");

// Mock ReactFlow
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

import { useReactFlow } from "@xyflow/react";

const mockSetCenter = jest.fn();
const mockSetNodes = jest.fn();
const mockGetNode = jest.fn();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ReactFlowProvider>
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    </ReactFlowProvider>
  );
};

describe("BookmarksPanel", () => {
  const mockBookmarks = [
    {
      nodeId: "node-1",
      nodeName: "Input Image",
      nodeType: "nodetool.input.ImageInput",
      timestamp: Date.now()
    },
    {
      nodeId: "node-2",
      nodeName: "Text to Image",
      nodeType: "nodetool.text.Image",
      timestamp: Date.now() - 1000
    },
    {
      nodeId: "node-3",
      nodeName: "Output Image",
      nodeType: "nodetool.output.ImageOutput",
      timestamp: Date.now() - 2000
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    (useReactFlow as jest.Mock).mockReturnValue({
      setCenter: mockSetCenter,
      setNodes: mockSetNodes,
      getNode: mockGetNode
    });

    mockGetNode.mockImplementation((id: string) => ({
      id,
      position: { x: 100, y: 100 },
      width: 200,
      height: 100
    }));

    (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        bookmarks: mockBookmarks,
        removeBookmark: jest.fn()
      };
      if (typeof selector === "function") {
        return selector(state);
      }
      return state;
    });
  });

  describe("with bookmarks", () => {
    it("renders bookmark list", () => {
      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getByText("Input Image")).toBeInTheDocument();
      expect(screen.getByText("Text to Image")).toBeInTheDocument();
      expect(screen.getByText("Output Image")).toBeInTheDocument();
    });

    it("displays bookmark count", () => {
      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getByText("3 bookmarks")).toBeInTheDocument();
    });

    it("displays single bookmark count correctly", () => {
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: [mockBookmarks[0]],
          removeBookmark: jest.fn()
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getByText("1 bookmark")).toBeInTheDocument();
    });

    it("shows node type for each bookmark", () => {
      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getByText("ImageInput")).toBeInTheDocument();
      expect(screen.getByText("Image")).toBeInTheDocument();
      expect(screen.getByText("ImageOutput")).toBeInTheDocument();
    });

    it("navigates to node when bookmark is clicked", async () => {
      const user = userEvent.setup();
      const removeBookmarkMock = jest.fn();
      
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: mockBookmarks,
          removeBookmark: removeBookmarkMock
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<BookmarksPanel />);
      
      const firstBookmark = screen.getByText("Input Image").closest("div[role='button']");
      await user.click(firstBookmark!);
      
      expect(mockSetCenter).toHaveBeenCalledWith(
        200, // x position + width/2
        150, // y position + height/2
        { zoom: 1, duration: 300 }
      );
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it("removes bookmark when delete button is clicked", async () => {
      const user = userEvent.setup();
      const removeBookmarkMock = jest.fn();
      
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: mockBookmarks,
          removeBookmark: removeBookmarkMock
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<BookmarksPanel />);
      
      const deleteButtons = screen.getAllByLabelText("Remove bookmark");
      expect(deleteButtons).toHaveLength(3);
      
      await user.click(deleteButtons[0]);
      
      expect(removeBookmarkMock).toHaveBeenCalledWith("node-1");
    });

    it("prevents navigation when delete button is clicked", async () => {
      const user = userEvent.setup();
      const removeBookmarkMock = jest.fn();
      
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: mockBookmarks,
          removeBookmark: removeBookmarkMock
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<BookmarksPanel />);
      
      const deleteButtons = screen.getAllByLabelText("Remove bookmark");
      await user.click(deleteButtons[0]);
      
      // setCenter should not be called when clicking delete
      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("renders empty state message when no bookmarks exist", () => {
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: [],
          removeBookmark: jest.fn()
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getByText(/No bookmarks yet/)).toBeInTheDocument();
    });

    it("renders custom empty message when provided", () => {
      (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          bookmarks: [],
          removeBookmark: jest.fn()
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(
        <BookmarksPanel emptyMessage="Custom empty message" />
      );
      
      expect(screen.getByText("Custom empty message")).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("applies custom sx prop", () => {
      const customSx = { bgcolor: "background.paper" };
      
      renderWithTheme(
        <BookmarksPanel sx={customSx} />
      );
      
      expect(screen.getByText("3 bookmarks")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper aria labels for buttons", () => {
      renderWithTheme(<BookmarksPanel />);
      
      expect(screen.getAllByLabelText("Remove bookmark")).toHaveLength(3);
    });

    it("bookmark items are clickable", () => {
      renderWithTheme(<BookmarksPanel />);
      
      const bookmarks = screen.getAllByRole("button");
      // 3 bookmark items + 3 delete buttons = 6 total
      expect(bookmarks.length).toBeGreaterThanOrEqual(3);
    });
  });
});
