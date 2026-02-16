/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkflowDocumentation from "../WorkflowDocumentation";

// Mock the WorkflowManagerContext
const mockSaveWorkflow = jest.fn();
const mockGetWorkflow = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => ({
    getWorkflow: mockGetWorkflow,
    saveWorkflow: mockSaveWorkflow
  })
}));

// Mock the NotificationStore
const mockAddNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: () => mockAddNotification
}));

// Test utilities
const createMockWorkflow = (documentation: string = "") => ({
  id: "test-workflow-id",
  name: "Test Workflow",
  description: "A test workflow",
  access: "private",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  graph: { nodes: [], edges: [] },
  settings: documentation
    ? { documentation }
    : {},
  run_mode: "workflow"
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

// Create a proper theme with CSS variables (vars) for tests
const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: {
      main: "#1976d2",
      dark: "#115293",
      contrastText: "#fff"
    },
    success: {
      main: "#4caf50"
    },
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)"
    },
    divider: "#rgba(0, 0, 0, 0.12)",
    background: {
      default: "#fff",
      paper: "#fff"
    },
    grey: {
      0: "#fff",
      500: "#9e9e9e",
      700: "#616161",
      800: "#424242",
      900: "#212121"
    }
  },
  spacing: 8,
  fontSize: 14,
  fontSizeSmall: 12,
  fontSizeNormal: 14,
  fontFamily1: "Roboto, sans-serif",
  zIndex: {
    autocomplete: 1300
  }
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        {component}
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("WorkflowDocumentation", () => {
  const workflowId = "test-workflow-id";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Empty State", () => {
    it("should display empty state when no documentation exists", () => {
      mockGetWorkflow.mockReturnValue(createMockWorkflow(""));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      expect(screen.getByText("No documentation yet")).toBeInTheDocument();
      expect(screen.getByText(/Click the edit button to add workflow documentation/)).toBeInTheDocument();
    });

    it("should show edit button in empty state", () => {
      mockGetWorkflow.mockReturnValue(createMockWorkflow(""));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      expect(editButton).toBeInTheDocument();
    });
  });

  describe("View Mode", () => {
    it("should display documentation text when it exists", () => {
      const docText = "This is a test documentation for the workflow.";
      mockGetWorkflow.mockReturnValue(createMockWorkflow(docText));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      expect(screen.getByText(docText)).toBeInTheDocument();
      // Check that character count is displayed
      expect(screen.getByText(/chars/)).toBeInTheDocument();
    });

    it("should show edit button when viewing documentation", () => {
      mockGetWorkflow.mockReturnValue(createMockWorkflow("Some documentation"));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const buttons = screen.getAllByRole("button");
      const editButton = buttons.find(btn => btn.querySelector('svg') !== null);
      expect(editButton).toBeInTheDocument();
    });

    it("should not show save/cancel buttons in view mode", () => {
      mockGetWorkflow.mockReturnValue(createMockWorkflow("Some documentation"));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  describe("Edit Mode", () => {
    it("should enter edit mode when edit button is clicked", async () => {
      const user = userEvent.setup();
      const docText = "Initial documentation";
      mockGetWorkflow.mockReturnValue(createMockWorkflow(docText));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue(docText);
      expect(textarea).not.toBeDisabled();
    });

    it("should show save and cancel buttons in edit mode", async () => {
      const user = userEvent.setup();
      mockGetWorkflow.mockReturnValue(createMockWorkflow("Some doc"));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("should save documentation when save button is clicked", async () => {
      const user = userEvent.setup();
      const initialDoc = "Initial documentation";
      const updatedDoc = "Updated documentation";
      const workflow = createMockWorkflow(initialDoc);
      mockGetWorkflow.mockReturnValue(workflow);
      mockSaveWorkflow.mockResolvedValue(undefined);

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, updatedDoc);

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockSaveWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: expect.objectContaining({
              documentation: updatedDoc
            })
          })
        );
      });

      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          content: "Documentation saved"
        })
      );
    });

    it("should cancel editing when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const initialDoc = "Initial documentation";
      mockGetWorkflow.mockReturnValue(createMockWorkflow(initialDoc));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Changed text");

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // Should exit edit mode and show original text
      expect(screen.getByText(initialDoc)).toBeInTheDocument();
    });

    it("should cancel with Escape keyboard shortcut", async () => {
      const user = userEvent.setup();
      const initialDoc = "Initial documentation";
      mockGetWorkflow.mockReturnValue(createMockWorkflow(initialDoc));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Changed text");

      // Press Escape
      await user.keyboard("{Escape}");

      // Should exit edit mode and show original text
      expect(screen.getByText(initialDoc)).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should show error notification when save fails", async () => {
      const user = userEvent.setup();
      const docText = "Documentation to save";
      mockGetWorkflow.mockReturnValue(createMockWorkflow(docText));
      mockSaveWorkflow.mockRejectedValue(new Error("Save failed"));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "error",
            content: "Failed to save documentation"
          })
        );
      });
    });
  });

  describe("Accessibility", () => {
    it("should have proper buttons for interaction", () => {
      mockGetWorkflow.mockReturnValue(createMockWorkflow("Test documentation"));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const buttons = screen.getAllByRole("button");
      const editButton = buttons.find(btn => btn.querySelector('svg') !== null);
      expect(editButton).toBeInTheDocument();
    });

    it("should have proper placeholder text for empty documentation", async () => {
      const user = userEvent.setup();
      mockGetWorkflow.mockReturnValue(createMockWorkflow(""));

      renderWithProviders(<WorkflowDocumentation workflowId={workflowId} />);

      const editButton = screen.getAllByRole("button").find(btn => btn.querySelector('svg') !== null);
      await user.click(editButton!);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("placeholder");
      expect(textarea.getAttribute("placeholder")).toContain("Add documentation for this workflow");
    });
  });
});
