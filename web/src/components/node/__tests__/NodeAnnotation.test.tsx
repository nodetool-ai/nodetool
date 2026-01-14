import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import NodeAnnotation from "../NodeAnnotation";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../stores/NodeAnnotationStore", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    openAnnotationDialog: jest.fn(),
    closeAnnotationDialog: jest.fn(),
    setAnnotationText: jest.fn(),
    clearEditingState: jest.fn()
  }))
}));

const mockUpdateNodeData = jest.fn();
jest.mock("../../../contexts/NodeContext", () => ({
  __esModule: true,
  useNodes: jest.fn(() => ({
    updateNodeData: mockUpdateNodeData
  }))
}));

describe("NodeAnnotation", () => {
  const mockProps = {
    nodeId: "test-node-1",
    annotation: "This is a test annotation",
    isSelected: true,
    isDarkMode: false
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("displays annotation when provided and node is selected", () => {
    renderWithTheme(<NodeAnnotation {...mockProps} />);

    expect(screen.getByText("This is a test annotation")).toBeInTheDocument();
  });

  test("does not display when annotation is empty and node is not selected", () => {
    renderWithTheme(
      <NodeAnnotation
        nodeId="test-node-1"
        annotation=""
        isSelected={false}
        isDarkMode={false}
      />
    );

    expect(screen.queryByText("This is a test annotation")).not.toBeInTheDocument();
  });

  test("shows edit button when selected", () => {
    renderWithTheme(<NodeAnnotation {...mockProps} />);

    const editButton = screen.getByTitle("Edit annotation");
    expect(editButton).toBeInTheDocument();
  });

  test("does not show edit button when not selected", () => {
    renderWithTheme(
      <NodeAnnotation
        nodeId="test-node-1"
        annotation="Test annotation"
        isSelected={false}
        isDarkMode={false}
      />
    );

    expect(screen.queryByTitle("Edit annotation")).not.toBeInTheDocument();
  });

  test("renders correctly with dark mode", () => {
    renderWithTheme(
      <NodeAnnotation
        nodeId="test-node-1"
        annotation="Test annotation"
        isSelected={true}
        isDarkMode={true}
      />
    );

    expect(screen.getByText("Test annotation")).toBeInTheDocument();
    expect(screen.getByTitle("Edit annotation")).toBeInTheDocument();
  });

  test("does not apply dark mode styles when isDarkMode is false", () => {
    renderWithTheme(
      <NodeAnnotation
        nodeId="test-node-1"
        annotation="Test annotation"
        isSelected={true}
        isDarkMode={false}
      />
    );

    const annotationBubble = screen.getByText("Test annotation").closest("div");
    expect(annotationBubble).not.toHaveClass("dark-mode");
  });
});
