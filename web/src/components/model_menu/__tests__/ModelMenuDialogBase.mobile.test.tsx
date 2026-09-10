import { stub } from "../../../test-utils/doubles";
import userEvent from "@testing-library/user-event";
import { useProviders } from "../../../hooks/useProviders";
import { useProviderOnboardingStore } from "../../../stores/ProviderOnboardingStore";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import type { LanguageModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
beforeEach(() => {
  useProviderOnboardingStore.setState({ open: false });
  jest.mocked(useProviders).mockReturnValue({ providers: [{ provider: "openai", capabilities: ["generate_message"], access: "remote_api", display_name: "OpenAI" }], isLoading: false, isFetching: false, error: null });
});

const MOBILE_WIDTH_QUERY = /max-width/;

/** Drive MUI's useMediaQuery: only max-width queries match on "mobile". */
const setViewport = (mobile: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: mobile && MOBILE_WIDTH_QUERY.test(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
};

const models: LanguageModel[] = [
  { type: "language_model", id: "gpt-4o", name: "GPT-4o", provider: "openai" }
];

const renderMenu = (modelType?: string, menuModels = models, onClose = jest.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ModelMenuDialogBase<LanguageModel>
            open
            onClose={onClose}
            modelType={modelType}
            title="Select Language Model"
            modelData={{ models: menuModels, isLoading: false, error: null }}
            storeHook={useLanguageModelMenuStore}
          />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("ModelMenuDialogBase responsive layout", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("fills the viewport and offers a close button on mobile", () => {
    setViewport(true);
    renderMenu();

    expect(screen.getByText("Select Language Model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();

    const paper = document.querySelector(".MuiPopover-paper") as HTMLElement;
    expect(paper.style.width).toBe("100vw");
    expect(paper.style.height).toBe("100dvh");

    expect(
      document.querySelector(".model-menu__providers-list.is-horizontal")
    ).toBeInTheDocument();
  });

  it("keeps the anchored popover and vertical provider rail on desktop", () => {
    setViewport(false);
    renderMenu();

    expect(screen.queryByText("Select Language Model")).not.toBeInTheDocument();

    const paper = document.querySelector(".MuiPopover-paper") as HTMLElement;
    expect(paper.style.width).toBe("600px");

    expect(
      document.querySelector(".model-menu__providers-list.is-horizontal")
    ).not.toBeInTheDocument();
  });
});

it("opens provider setup from the shared picker footer", async () => {
  renderMenu("language_model");
  await userEvent.click(screen.getByRole("button", { name: "Add providers" }));
  expect(useProviderOnboardingStore.getState()).toMatchObject({ open: true, capability: "generate_message" });
});

it("automatically replaces an empty image picker with image-provider setup", () => {
  const close = jest.fn();
  renderMenu("image_model", [], close);
  expect(close).toHaveBeenCalledTimes(1);
  expect(useProviderOnboardingStore.getState()).toMatchObject({ open: true, capability: "text_to_image" });
});

it("does not redirect an empty list when its provider is already configured", () => {
  renderMenu("language_model", []);
  expect(useProviderOnboardingStore.getState().open).toBe(false);
});
