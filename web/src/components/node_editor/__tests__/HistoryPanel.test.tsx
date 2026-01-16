import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryPanel from "../HistoryPanel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../stores/HistoryStore", () => ({
  useHistoryStore: jest.fn()
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useTemporalNodes: jest.fn()
}));

import { useHistoryStore } from "../../../stores/HistoryStore";
import { useTemporalNodes } from "../../../contexts/NodeContext";

const mockUndo = jest.fn();
const mockRedo = jest.fn();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("HistoryPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useHistoryStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        isOpen: true,
        entries: [
          {
            id: "entry-1",
            timestamp: Date.now() - 1000,
            actionType: "addNode",
            description: "Added text input node",
            nodeCount: 5,
            edgeCount: 3
          },
          {
            id: "entry-2",
            timestamp: Date.now() - 2000,
            actionType: "moveNode",
            description: "Moved nodes to new position",
            nodeCount: 5,
            edgeCount: 3
          },
          {
            id: "entry-3",
            timestamp: Date.now() - 3000,
            actionType: "connectNode",
            description: "Connected output to input",
            nodeCount: 4,
            edgeCount: 2
          }
        ],
        selectedEntryId: null,
        setIsOpen: jest.fn(),
        toggleOpen: jest.fn(),
        addEntry: jest.fn(),
        clearEntries: jest.fn(),
        setSelectedEntry: jest.fn()
      };
      return selector(state);
    });

    (useTemporalNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        pastStates: [{ nodes: [], edges: [] }, { nodes: [], edges: [] }],
        present: { nodes: [], edges: [] },
        futureStates: [{ nodes: [], edges: [] }],
        undo: mockUndo,
        redo: mockRedo
      })
    );
  });

  it("renders when open", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    (useHistoryStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isOpen: false,
        entries: [],
        selectedEntryId: null,
        setIsOpen: jest.fn(),
        toggleOpen: jest.fn(),
        addEntry: jest.fn(),
        clearEntries: jest.fn(),
        setSelectedEntry: jest.fn()
      })
    );
    const { container } = renderWithTheme(<HistoryPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("displays history entries", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText("Added node")).toBeInTheDocument();
    expect(screen.getByText("Moved node")).toBeInTheDocument();
    expect(screen.getByText("Connected nodes")).toBeInTheDocument();
  });

  it("shows entry count", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText(/3 entries in history/)).toBeInTheDocument();
  });

  it("shows empty state when no entries", () => {
    (useHistoryStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isOpen: true,
        entries: [],
        selectedEntryId: null,
        setIsOpen: jest.fn(),
        toggleOpen: jest.fn(),
        addEntry: jest.fn(),
        clearEntries: jest.fn(),
        setSelectedEntry: jest.fn()
      })
    );
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText("No history yet")).toBeInTheDocument();
    expect(screen.getByText("Start editing to track your changes")).toBeInTheDocument();
  });

  it("has undo button enabled when past states exist", () => {
    const mockStore = {
      pastStates: [{ nodes: [], edges: [] }],
      present: { nodes: [], edges: [] },
      futureStates: [],
      undo: mockUndo,
      redo: mockRedo
    };
    (useTemporalNodes as unknown as jest.Mock).mockImplementation((selector) => selector(mockStore));
    const { unmount } = renderWithTheme(<HistoryPanel />);
    const undoIcons = screen.getAllByTestId("UndoIcon");
    const undoIcon = undoIcons[0];
    expect(undoIcon).not.toBeNull();
    const button = undoIcon?.closest("button");
    expect(button).not.toBeDisabled();
    unmount();
  });

  it("has redo button enabled when future states exist", () => {
    const mockStore = {
      pastStates: [],
      present: { nodes: [], edges: [] },
      futureStates: [{ nodes: [], edges: [] }],
      undo: mockUndo,
      redo: mockRedo
    };
    (useTemporalNodes as unknown as jest.Mock).mockImplementation((selector) => selector(mockStore));
    const { unmount } = renderWithTheme(<HistoryPanel />);
    const redoIcons = screen.getAllByTestId("RedoIcon");
    const redoIcon = redoIcons[0];
    expect(redoIcon).not.toBeNull();
    const button = redoIcon?.closest("button");
    expect(button).not.toBeDisabled();
    unmount();
  });

  it("disables undo button when no past states", () => {
    const mockStore = {
      pastStates: [],
      present: { nodes: [], edges: [] },
      futureStates: [{ nodes: [], edges: [] }],
      undo: mockUndo,
      redo: mockRedo
    };
    (useTemporalNodes as unknown as jest.Mock).mockImplementation((selector) => selector(mockStore));
    const { unmount } = renderWithTheme(<HistoryPanel />);
    const undoIcons = screen.getAllByTestId("UndoIcon");
    const undoIcon = undoIcons[0];
    expect(undoIcon).not.toBeNull();
    const button = undoIcon?.closest("button");
    expect(button).toBeDisabled();
    unmount();
  });

  it("disables redo button when no future states", () => {
    const mockStore = {
      pastStates: [{ nodes: [], edges: [] }],
      present: { nodes: [], edges: [] },
      futureStates: [],
      undo: mockUndo,
      redo: mockRedo
    };
    (useTemporalNodes as unknown as jest.Mock).mockImplementation((selector) => selector(mockStore));
    const { unmount } = renderWithTheme(<HistoryPanel />);
    const redoIcons = screen.getAllByTestId("RedoIcon");
    const redoIcon = redoIcons[0];
    expect(redoIcon).not.toBeNull();
    const button = redoIcon?.closest("button");
    expect(button).toBeDisabled();
    unmount();
  });

  it("displays node and edge counts for each entry", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getAllByText(/5 nodes/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/3 edges/).length).toBeGreaterThanOrEqual(2);
  });

  it("displays entry descriptions when available", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText("Added text input node")).toBeInTheDocument();
    expect(screen.getByText("Moved nodes to new position")).toBeInTheDocument();
    expect(screen.getByText("Connected output to input")).toBeInTheDocument();
  });

  it("calls clearEntries when clear button is clicked", async () => {
    const clearEntries = jest.fn();
    (useHistoryStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isOpen: true,
        entries: [
          {
            id: "entry-1",
            timestamp: Date.now(),
            actionType: "addNode",
            description: "",
            nodeCount: 1,
            edgeCount: 0
          }
        ],
        selectedEntryId: null,
        setIsOpen: jest.fn(),
        toggleOpen: jest.fn(),
        addEntry: jest.fn(),
        clearEntries: clearEntries,
        setSelectedEntry: jest.fn()
      })
    );
    renderWithTheme(<HistoryPanel />);
    const clearButton = screen.getByTestId("DeleteSweepIcon").closest("button") as HTMLElement;
    await userEvent.click(clearButton);
    expect(clearEntries).toHaveBeenCalled();
  });

  it("highlights selected entry", () => {
    (useHistoryStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isOpen: true,
        entries: [
          {
            id: "selected-entry",
            timestamp: Date.now(),
            actionType: "addNode",
            description: "",
            nodeCount: 1,
            edgeCount: 0
          }
        ],
        selectedEntryId: "selected-entry",
        setIsOpen: jest.fn(),
        toggleOpen: jest.fn(),
        addEntry: jest.fn(),
        clearEntries: jest.fn(),
        setSelectedEntry: jest.fn()
      })
    );
    renderWithTheme(<HistoryPanel />);
    const listItem = screen.getByText("Added node").closest("div[role='button']");
    expect(listItem).toBeInTheDocument();
  });

  it("calls onJumpToState when entry is clicked", async () => {
    const onJumpToState = jest.fn();
    renderWithTheme(<HistoryPanel onJumpToState={onJumpToState} />);
    const entry = screen.getByText("Added node");
    await userEvent.click(entry);
    expect(onJumpToState).toHaveBeenCalledWith(0);
  });

  it("displays keyboard shortcut hint", () => {
    renderWithTheme(<HistoryPanel />);
    expect(screen.getByText(/Ctrl\+H to open/)).toBeInTheDocument();
  });
});
