import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ImageModelSelect from "../ImageModelSelect";

const models = [
  { id: "shared", provider: "first", name: "First provider model" },
  { id: "shared", provider: "second", name: "Second provider model" }
];

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models })
}));
jest.mock("../../model_menu/ImageModelMenuDialog", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../studio/StudioContext", () => ({
  useInStudio: () => false
}));

it("shows the selected provider when two image models share an ID", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ImageModelSelect
        value="shared"
        provider="second"
        onChange={jest.fn()}
      />
    </ThemeProvider>
  );

  expect(
    screen.getByRole("button", { name: /second provider model/i })
  ).toBeInTheDocument();
  expect(screen.queryByText("First provider model")).not.toBeInTheDocument();
});
