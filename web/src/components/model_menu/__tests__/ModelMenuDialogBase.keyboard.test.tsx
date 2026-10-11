import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { useProviders } from "../../../hooks/useProviders";
import type { LanguageModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../../hooks/useModelAvailability", () => {
  const available = () => ({
    available: true,
    providerEnabled: true,
    hasKey: true
  });
  return { useModelAvailability: () => available };
});

const models: LanguageModel[] = [
  { type: "language_model", id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { type: "language_model", id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
  {
    type: "language_model",
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic"
  }
];

const renderMenu = (onModelChange: jest.Mock, menuModels = models) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const ui = (list: LanguageModel[]) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ModelMenuDialogBase<LanguageModel>
            open
            onClose={jest.fn()}
            onModelChange={onModelChange}
            modelData={{ models: list, isLoading: false, error: null }}
            storeHook={useLanguageModelMenuStore}
          />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(ui(menuModels));
  return {
    ...result,
    rerenderWith: (list: LanguageModel[]) => result.rerender(ui(list))
  };
};

const searchField = () =>
  screen.getByTestId("search-input-field") as HTMLInputElement;

beforeEach(() => {
  jest.mocked(useProviders).mockReturnValue({
    providers: [],
    isLoading: false,
    isFetching: false,
    error: null
  });
  useLanguageModelMenuStore.setState({ search: "", selectedProvider: null });
  useModelPreferencesStore.setState({ favorites: new Set(), recents: [] });
});

it("selects the top match of the typed term when Enter beats the debounce", () => {
  const onModelChange = jest.fn();
  renderMenu(onModelChange);

  // Unfiltered, "Claude Sonnet" is the top row.
  fireEvent.change(searchField(), { target: { value: "4o" } });
  fireEvent.keyDown(searchField(), { key: "Enter" });

  expect(onModelChange).toHaveBeenCalledTimes(1);
  expect(onModelChange.mock.calls[0][0]).toMatchObject({ id: "gpt-4o" });
});

it("keeps an arrowed-to highlight when the list changes", () => {
  const onModelChange = jest.fn();
  const { rerenderWith } = renderMenu(onModelChange);

  fireEvent.keyDown(searchField(), { key: "ArrowDown" });
  fireEvent.keyDown(searchField(), { key: "Enter" });
  const highlighted = onModelChange.mock.calls[0][0] as LanguageModel;
  expect(highlighted.id).not.toBe("claude-sonnet");

  // A refetch that adds a model must not move the highlight back to the top.
  rerenderWith([
    { type: "language_model", id: "o3", name: "O3", provider: "openai" },
    ...models
  ]);
  fireEvent.keyDown(searchField(), { key: "Enter" });
  expect(onModelChange.mock.calls[1][0]).toMatchObject({ id: highlighted.id });
});

it("leaves the Favorites view when a search term is typed", () => {
  useModelPreferencesStore.setState({
    favorites: new Set(["anthropic:claude-sonnet"])
  });
  const onModelChange = jest.fn();
  renderMenu(onModelChange);

  fireEvent.click(screen.getByLabelText("Favorites"));
  fireEvent.change(searchField(), { target: { value: "4o" } });
  act(() => {
    fireEvent.keyDown(searchField(), { key: "Enter" });
  });

  expect(onModelChange.mock.calls[0][0]).toMatchObject({ id: "gpt-4o" });
});
