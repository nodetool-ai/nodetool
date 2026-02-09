/**
 * Tests for WorkflowNotesPanel component
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import WorkflowNotesPanel from "../WorkflowNotesPanel";
import { useWorkflowNotesStore } from "../../../stores/WorkflowNotesStore";

// Mock the date-fns library
jest.mock("date-fns", () => ({
  formatDistanceToNow: jest.fn(() => "a few seconds ago")
}));

// Mock useTheme hook
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: {
      palette: {
        background: { default: "#202020", paper: "#232323" },
        divider: "#2f2f2f",
        primary: { main: "#77b4e6" },
        text: { primary: "#ffffff", secondary: "#bdbdbd" },
        action: { selected: "rgba(255,255,255,0.16)" }
      }
    },
    palette: {
      background: { default: "#202020", paper: "#232323" },
      divider: "#2f2f2f",
      primary: { main: "#77b4e6" },
      text: { primary: "#ffffff", secondary: "#bdbdbd" }
    },
    spacing: (factor: number) => `${factor * 8}px`
  })
}));

describe("WorkflowNotesPanel", () => {
  const mockWorkflowId = "test-workflow-123";
  
  beforeEach(() => {
    // Clear all notes before each test
    const store = useWorkflowNotesStore.getState();
    Object.keys(store.notes).forEach((workflowId) => {
      store.deleteNotes(workflowId);
    });
    jest.clearAllMocks();
  });

  it("should render the panel with header", () => {
    render(<WorkflowNotesPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText("Workflow Notes")).toBeInTheDocument();
  });

  it("should display textarea in edit mode by default", () => {
    render(<WorkflowNotesPanel workflowId={mockWorkflowId} />);
    
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
  });

  it("should load existing notes for the workflow", () => {
    const store = useWorkflowNotesStore.getState();
    store.updateNotes(mockWorkflowId, "# Existing Notes\n\nThese are existing notes.");
    
    render(<WorkflowNotesPanel workflowId={mockWorkflowId} />);
    
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("# Existing Notes\n\nThese are existing notes.");
  });

  it("should display word and character count", () => {
    render(<WorkflowNotesPanel workflowId={mockWorkflowId} />);
    
    expect(screen.getByText(/words/i)).toBeInTheDocument();
    expect(screen.getByText(/characters/i)).toBeInTheDocument();
  });

  it("should update word count as user types", async () => {
    const user = userEvent.setup();
    render(<WorkflowNotesPanel workflowId={mockWorkflowId} />);
    
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "This is a test");
    
    await waitFor(() => {
      expect(screen.getByText("4 words")).toBeInTheDocument();
    });
  });

  it("should handle empty workflowId gracefully", () => {
    render(<WorkflowNotesPanel workflowId="" />);
    
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
  });
});
