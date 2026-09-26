import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import EntityStillModelWarning from "../EntityStillModelWarning";

const models = [
  { id: "shared", provider: "editor", supported_tasks: ["image_to_image"] },
  { id: "shared", provider: "text-only", supported_tasks: ["text_to_image"] }
];

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models })
}));

it("warns when the selected provider cannot edit reference images", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <EntityStillModelWarning modelId="shared" provider="text-only" />
    </ThemeProvider>
  );
  expect(screen.getByText(/only takes text/i)).toBeInTheDocument();
});

it("does not warn when the selected provider supports image editing", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <EntityStillModelWarning modelId="shared" provider="editor" />
    </ThemeProvider>
  );
  expect(screen.queryByText(/only takes text/i)).not.toBeInTheDocument();
});
