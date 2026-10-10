/**
 * @jest-environment jsdom
 *
 * A model list that failed to load offers a way to ask again (V6): without
 * one the format step was stuck until a reload.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { DirectorModelPicker } from "../DirectorModelPicker";

const mockRefetch = jest.fn(async () => undefined);

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({
    models: [],
    providers: [],
    isLoading: false,
    isFetching: false,
    error: new Error("network down"),
    refetch: mockRefetch
  })
}));
jest.mock("../../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

beforeEach(() => {
  mockRefetch.mockClear();
  useTimelineStore.getState().reset();
});

describe("DirectorModelPicker", () => {
  it("offers Try again when the model list could not be read", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <DirectorModelPicker />
      </ThemeProvider>
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The model list could not be read: network down"
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("offers Report when the model list could not be read (V4)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DirectorModelPicker />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });
});
