import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import NodeAnnotation from "../../../components/node/NodeAnnotation";
import { useNodes } from "../../../contexts/NodeContext";
import "@testing-library/jest-dom";

jest.mock("../../../contexts/NodeContext");

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("NodeAnnotation", () => {
  const mockUpdateNodeData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render content when annotation is undefined", () => {
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
    renderWithProviders(<NodeAnnotation nodeId="test-node" />);
    
    // Header is not rendered when annotation is undefined
    expect(screen.queryByText("Annotation")).not.toBeInTheDocument();
  });

  it("renders annotation header when annotation is provided", () => {
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
    renderWithProviders(<NodeAnnotation nodeId="test-node" annotation="This is a test annotation" />);
    
    expect(screen.getByText("Annotation")).toBeInTheDocument();
  });

  it("expands annotation content when header is clicked", async () => {
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
    renderWithProviders(<NodeAnnotation nodeId="test-node" annotation="Test annotation" />);
    
    const header = screen.getByText("Annotation").closest("div");
    fireEvent.click(header!);
    
    const contentDiv = await screen.findByTestId("annotation-content");
    expect(contentDiv).toHaveTextContent("Test annotation");
  });

  it("enters edit mode when clicking edit", async () => {
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
    renderWithProviders(<NodeAnnotation nodeId="test-node" annotation="Test annotation" />);
    
    const header = screen.getByText("Annotation").closest("div");
    fireEvent.click(header!);
    
    const editButton = screen.getByTestId("EditIcon");
    fireEvent.click(editButton);
    
    expect(await screen.findByPlaceholderText("Add your annotation...")).toBeInTheDocument();
  });
});
