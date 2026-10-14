import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import { useProviders } from "../../../hooks/useProviders";
import { openSettingsTab } from "../../workspace/openPageTab";
import type { LanguageModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../workspace/openPageTab", () => ({
  ...jest.requireActual("../../workspace/openPageTab"),
  openSettingsTab: jest.fn()
}));

beforeEach(() => {
  jest.mocked(useProviders).mockReturnValue({
    // A provider exists, so the picker opens instead of handing off to setup,
    // and it has no models, so the list shows its Open Settings action.
    providers: [
      { provider: "openai", capabilities: ["generate_message"] }
    ] as unknown as ReturnType<typeof useProviders>["providers"],
    isLoading: false,
    isFetching: false,
    error: null
  });
  useLanguageModelMenuStore.setState({ search: "", selectedProvider: null });
});

it("closes the picker when its Open Settings opens the Settings tab", () => {
  const onClose = jest.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ModelMenuDialogBase<LanguageModel>
            open
            onClose={onClose}
            onModelChange={jest.fn()}
            modelData={{ models: [], isLoading: false, error: null }}
            storeHook={useLanguageModelMenuStore}
          />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

  fireEvent.click(screen.getAllByRole("button", { name: "Open settings" })[0]);

  expect(openSettingsTab).toHaveBeenCalledWith("providers");
  expect(onClose).toHaveBeenCalled();
});
