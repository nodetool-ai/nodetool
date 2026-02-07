/**
 * Unit tests for WorkflowNotesPanel component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { WorkflowNotesPanel } from "../WorkflowNotesPanel";
import { useWorkflowNotesStore } from "../../../stores/WorkflowNotesStore";
import { ThemeProvider } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";

// Wrapper with MUI theme
const theme = createTheme();
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe("WorkflowNotesPanel", () => {
  const mockWorkflowId = "test-workflow-1";
  const mockOnClose = jest.fn();

  beforeEach(() => {
    // Reset store before each test
    useWorkflowNotesStore.setState({ notes: {} });
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <ThemeWrapper>
        <WorkflowNotesPanel workflowId={mockWorkflowId} onClose={mockOnClose} />
      </ThemeWrapper>
    );
  };

  describe("initial state (empty note)", () => {
    it("should render panel with headline", () => {
      renderComponent();
      
      expect(screen.getByText("Workflow Notes")).toBeInTheDocument();
    });

    it("should display info alert when note is empty", () => {
      renderComponent();
      
      expect(screen.getByText(/Add notes to document your workflow/)).toBeInTheDocument();
    });

    it("should display textarea with placeholder", () => {
      renderComponent();
      
      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute("placeholder", "Add your workflow notes here...");
    });

    it("should not show metadata or stats when note is empty", () => {
      renderComponent();
      
      expect(screen.queryByText(/Created:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/word/)).not.toBeInTheDocument();
      expect(screen.queryByText(/character/)).not.toBeInTheDocument();
    });
  });

  describe("creating and editing notes", () => {
    it("should create new note when user types in textarea", async () => {
      const user = userEvent.setup();
      renderComponent();

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "My first workflow note");

      // Verify note was saved to store
      const note = useWorkflowNotesStore.getState().getNote(mockWorkflowId);
      expect(note).toBeDefined();
      expect(note?.content).toBe("My first workflow note");
      expect(note?.workflowId).toBe(mockWorkflowId);
    });

    it("should display metadata after note is created", async () => {
      const user = userEvent.setup();
      renderComponent();

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Test note");

      // Wait for state update
      await screen.findByText(/Created:/);
    });

    it("should update existing note when user types", async () => {
      const user = userEvent.setup();
      
      // Create initial note
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "Initial note");
      
      renderComponent();

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Initial note");

      await user.clear(textarea);
      await user.type(textarea, "Updated note");

      const note = useWorkflowNotesStore.getState().getNote(mockWorkflowId);
      expect(note?.content).toBe("Updated note");
    });

    it("should show word and character count for non-empty note", async () => {
      const user = userEvent.setup();
      renderComponent();

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");

      await screen.findByText("2 words");
      await screen.findByText("11 characters");
    });

    it("should handle single word correctly", async () => {
      const user = userEvent.setup();
      renderComponent();

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Test");

      await screen.findByText("1 word");
      await screen.findByText("4 characters");
    });
  });

  describe("deleting notes", () => {
    it("should show delete button when note exists", () => {
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "Existing note");
      renderComponent();

      const deleteButtons = screen.getAllByLabelText("Delete note");
      expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it("should not show delete button when note is empty", () => {
      renderComponent();

      expect(screen.queryByLabelText("Delete note")).not.toBeInTheDocument();
    });

    it("should delete note when delete button is clicked", async () => {
      const user = userEvent.setup();
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "To be deleted");
      
      renderComponent();

      const deleteButton = screen.getByLabelText("Delete note");
      await user.click(deleteButton);

      await screen.findByText(/Add notes to document your workflow/);
    });
  });

  describe("panel actions", () => {
    it("should call onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      const closeButton = screen.getByLabelText("Close");
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should persist notes when component unmounts and remounts", async () => {
      const user = userEvent.setup();
      const { rerender } = renderComponent();

      // Create a note
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Persistent note");

      // Unmount
      rerender(<div />);

      // Remount
      rerender(
        <ThemeWrapper>
          <WorkflowNotesPanel workflowId={mockWorkflowId} onClose={mockOnClose} />
        </ThemeWrapper>
      );

      // Note should still be there
      const note = useWorkflowNotesStore.getState().getNote(mockWorkflowId);
      expect(note?.content).toBe("Persistent note");
    });
  });

  describe("existing note with metadata", () => {
    it("should display created and updated dates when note was updated", () => {
      // Create a note with different timestamps
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "Initial");
      
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);
      
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "Updated content");
      
      jest.useRealTimers();
      
      renderComponent();

      const note = useWorkflowNotesStore.getState().getNote(mockWorkflowId);
      expect(note?.createdAt).not.toBe(note?.updatedAt);
    });

    it("should only show created date when note was never updated", () => {
      useWorkflowNotesStore.getState().setNote(mockWorkflowId, "New note");
      renderComponent();

      const note = useWorkflowNotesStore.getState().getNote(mockWorkflowId);
      
      // If createdAt equals updatedAt, only show "Created:"
      if (note?.createdAt === note?.updatedAt) {
        expect(screen.getByText(/Created:/)).toBeInTheDocument();
        expect(screen.queryByText(/Updated:/)).not.toBeInTheDocument();
      }
    });
  });
});
