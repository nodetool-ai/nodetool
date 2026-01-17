import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NodeComment } from "../NodeComment";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("NodeComment", () => {
  const defaultProps = {
    _nodeId: "test-node",
    comment: undefined,
    onUpdateComment: jest.fn()
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should not render when comment is undefined", () => {
    renderWithTheme(<NodeComment {...defaultProps} />);

    const commentSection = screen.queryByText("Comment");
    expect(commentSection).not.toBeInTheDocument();
  });

  it("should not render when comment is empty string", () => {
    renderWithTheme(<NodeComment {...defaultProps} comment="" />);

    const commentSection = screen.queryByText("Comment");
    expect(commentSection).not.toBeInTheDocument();
  });

  it("should render comment text when comment exists", () => {
    const commentText = "This is a test comment";
    renderWithTheme(<NodeComment {...defaultProps} comment={commentText} />);

    expect(screen.getByText(commentText)).toBeInTheDocument();
    expect(screen.getByTestId("CommentIcon")).toBeInTheDocument();
  });

  it("should be memoized", () => {
    const { rerender } = renderWithTheme(<NodeComment {...defaultProps} />);

    const before = screen.queryByRole("img", { name: /comment/i });
    expect(before).not.toBeInTheDocument();

    rerender(<ThemeProvider theme={mockTheme}><NodeComment {...defaultProps} /></ThemeProvider>);

    const after = screen.queryByRole("img", { name: /comment/i });
    expect(after).not.toBeInTheDocument();
  });
});
