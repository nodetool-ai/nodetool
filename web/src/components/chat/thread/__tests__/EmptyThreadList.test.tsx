import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { EmptyThreadList } from "../EmptyThreadList";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("EmptyThreadList", () => {
  it("shows the default empty message when not filtered", () => {
    renderWithTheme(<EmptyThreadList />);
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("shows a no-match message when filtered", () => {
    renderWithTheme(<EmptyThreadList isFiltered />);
    expect(screen.getByText("No matching conversations")).toBeInTheDocument();
    expect(screen.getByText("Try a different search term.")).toBeInTheDocument();
  });
});
