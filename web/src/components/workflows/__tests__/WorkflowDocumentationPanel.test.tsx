import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import WorkflowDocumentationPanel from "../WorkflowDocumentationPanel";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useWorkflowDocumentationStore
} from "../../../stores/WorkflowDocumentationStore";

// Mock the WorkflowManagerContext
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(() => ({
    currentWorkflowId: "test-workflow-id"
  }))
}));

// Mock the MarkdownRenderer
jest.mock("../../../utils/MarkdownRenderer", () => {
  return function MockMarkdownRenderer({ content }: { content: string }) {
    return <div data-testid="markdown-renderer">{content}</div>;
  };
});

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
}

describe("WorkflowDocumentationPanel", () => {
  const mockWorkflowId = "test-workflow-1";

  beforeEach(() => {
    // Reset store state before each test
    useWorkflowDocumentationStore.setState({
      documentation: {},
      isEditing: false,
      currentWorkflowId: null
    });
    jest.clearAllMocks();
  });

  describe("empty state", () => {
    it("displays empty state when no documentation exists", () => {
      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.getByText("No documentation yet")).toBeInTheDocument();
      expect(
        screen.getByText(/click the edit button to add documentation/i)
      ).toBeInTheDocument();
    });

    it("shows edit button in empty state", () => {
      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const editButton = screen.getByRole("button", { name: /edit documentation/i });
      expect(editButton).toBeInTheDocument();
    });
  });

  describe("view mode", () => {
    it("displays documentation content when available", () => {
      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "# Test Documentation\n\nThis is test content.",
            lastModified: Date.now()
          }
        },
        isEditing: false,
        currentWorkflowId: null
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.getByTestId("markdown-renderer")).toBeInTheDocument();
      expect(screen.getByTestId("markdown-renderer")).toHaveTextContent(
        "# Test Documentation\n\nThis is test content."
      );
    });

    it("shows edit button when not editing", () => {
      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Test content",
            lastModified: Date.now()
          }
        },
        isEditing: false,
        currentWorkflowId: null
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.getByRole("button", { name: /edit documentation/i })).toBeInTheDocument();
    });

    it("does not show save/cancel buttons when not editing", () => {
      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Test content",
            lastModified: Date.now()
          }
        },
        isEditing: false,
        currentWorkflowId: null
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("enters edit mode when edit button is clicked", async () => {
      const user = userEvent.setup();
      
      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Initial content",
            lastModified: Date.now()
          }
        },
        isEditing: false,
        currentWorkflowId: null
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const editButton = screen.getByRole("button", { name: /edit documentation/i });
      await user.click(editButton);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue("Initial content");
    });

    it("shows save and cancel buttons in edit mode", async () => {
      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Test content",
            lastModified: Date.now()
          }
        },
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("displays placeholder text when editing empty documentation", async () => {
      useWorkflowDocumentationStore.setState({
        documentation: {},
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue("");
    });
  });

  describe("save functionality", () => {
    it("saves documentation when save button is clicked", async () => {
      const user = userEvent.setup();
      const newContent = "# Updated Documentation\n\nNew content here.";

      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Original content",
            lastModified: Date.now()
          }
        },
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, newContent);

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      const documentation = useWorkflowDocumentationStore.getState().documentation;
      expect(documentation[mockWorkflowId].content).toBe(newContent);
    });

    it("exits edit mode after saving", async () => {
      const user = userEvent.setup();

      useWorkflowDocumentationStore.setState({
        documentation: {},
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      expect(screen.getByRole("button", { name: /edit documentation/i })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("cancel functionality", () => {
    it("discards changes when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const originalContent = "Original content";

      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: originalContent,
            lastModified: Date.now()
          }
        },
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Modified content");

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      const documentation = useWorkflowDocumentationStore.getState().documentation;
      expect(documentation[mockWorkflowId].content).toBe(originalContent);
    });

    it("exits edit mode after canceling", async () => {
      const user = userEvent.setup();

      useWorkflowDocumentationStore.setState({
        documentation: {
          [mockWorkflowId]: {
            workflowId: mockWorkflowId,
            content: "Test content",
            lastModified: Date.now()
          }
        },
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(screen.getByRole("button", { name: /edit documentation/i })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("header", () => {
    it("displays 'Documentation' title", () => {
      renderWithTheme(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

      expect(screen.getByText("Documentation")).toBeInTheDocument();
    });

    it("shows correct buttons based on edit state", () => {
      const { rerender } = renderWithTheme(
        <WorkflowDocumentationPanel workflowId={mockWorkflowId} />
      );

      // Not editing - show edit button
      expect(screen.getByRole("button", { name: /edit documentation/i })).toBeInTheDocument();

      useWorkflowDocumentationStore.setState({
        documentation: {},
        isEditing: true,
        currentWorkflowId: mockWorkflowId
      });

      rerender(
        <ThemeProvider theme={mockTheme}>
          <WorkflowDocumentationPanel workflowId={mockWorkflowId} />
        </ThemeProvider>
      );

      // Editing - show save and cancel buttons
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });
  });
});
