import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import NodeComment from "../NodeComment";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("NodeComment", () => {
  const mockOnChange = jest.fn();
  const mockOnRemove = jest.fn();

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders comment text when comment exists", () => {
    renderWithTheme(
      <NodeComment
        comment="Test comment"
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    expect(screen.getByText("Test comment")).toBeInTheDocument();
  });

  it("shows placeholder when no comment", () => {
    renderWithTheme(
      <NodeComment
        comment={undefined}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    expect(screen.getByText("Add a note...")).toBeInTheDocument();
  });

  it("removes comment when remove button is clicked", async () => {
    renderWithTheme(
      <NodeComment
        comment="Comment to remove"
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const removeButton = screen.getByLabelText("Remove comment");
    removeButton.click();

    expect(mockOnRemove).toHaveBeenCalled();
  });
});
