import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { PropertyFieldRow } from "../PropertyFieldRow";
import mockTheme from "../../../__mocks__/themeMock";

it("associates a single control with its row label", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <PropertyFieldRow label="Object name" htmlFor="object-name">
        <input id="object-name" />
      </PropertyFieldRow>
    </ThemeProvider>
  );

  expect(screen.getByRole("textbox", { name: "Object name" })).toBeInTheDocument();
});
