import React from "react";
import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import type { LanguageModel } from "../../../stores/ApiTypes";

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

const renderMenu = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ModelMenuDialogBase<LanguageModel>
            open
            onClose={jest.fn()}
            title="Select Language Model"
            modelData={{ models, isLoading: false, error: null }}
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
