import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { Chip } from "../Chip";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Chip", () => {
  it("draws an outlined chip by default", () => {
    renderWithTheme(<Chip label="Tag" />);
    const chip = screen.getByText("Tag").closest(".MuiChip-root");
    expect(chip).toHaveClass("MuiChip-outlined");
    expect(chip).toHaveClass("MuiChip-colorDefault");
  });

  it("uses the small size when compact", () => {
    renderWithTheme(<Chip label="v1.2" compact />);
    expect(screen.getByText("v1.2").closest(".MuiChip-root")).toHaveClass(
      "MuiChip-sizeSmall"
    );
  });

  it("draws a selected filter in primary and announces it as pressed", () => {
    renderWithTheme(<Chip label="Images" active onClick={() => undefined} />);
    const chip = screen.getByRole("button", { name: "Images" });
    expect(chip).toHaveClass("MuiChip-colorPrimary");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps an unselected filter neutral even when it has a tone", () => {
    renderWithTheme(
      <Chip
        label="Errors"
        color="error"
        active={false}
        onClick={() => undefined}
      />
    );
    const chip = screen.getByRole("button", { name: "Errors" });
    expect(chip).toHaveClass("MuiChip-colorDefault");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a selected filter's own tone", () => {
    renderWithTheme(
      <Chip label="Errors" color="error" active onClick={() => undefined} />
    );
    expect(screen.getByRole("button", { name: "Errors" })).toHaveClass(
      "MuiChip-colorError"
    );
  });

  it("does not mark a static chip as pressed", () => {
    renderWithTheme(<Chip label="Done" color="success" active />);
    const chip = screen.getByText("Done").closest(".MuiChip-root");
    expect(chip).not.toHaveAttribute("aria-pressed");
    expect(chip).toHaveClass("MuiChip-colorSuccess");
  });
});
