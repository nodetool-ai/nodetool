import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ListGroup, ListItemRow } from "../ListGroup";

const renderRow = (props: React.ComponentProps<typeof ListItemRow>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ListGroup>
        <ListItemRow {...props} />
      </ListGroup>
    </ThemeProvider>
  );

describe("ListItemRow", () => {
  it("disables the button of a clickable row", () => {
    renderRow({ primary: "Paste", onClick: jest.fn(), disabled: true });
    const button = screen.getByRole("button", { name: "Paste" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("tabindex", "-1");
  });

  it("applies buttonSx after the shared row styles", () => {
    renderRow({ primary: "Fit", onClick: jest.fn(), buttonSx: { minHeight: "44px" } });
    expect(getComputedStyle(screen.getByRole("button", { name: "Fit" })).minHeight).toBe("44px");
  });
});
