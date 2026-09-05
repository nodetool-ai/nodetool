import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import WelcomePlaceholder from "../WelcomePlaceholder";
import { useLanguageModelProviders } from "../../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../../stores/ProviderOnboardingStore";

jest.mock("../../../../hooks/useProviders", () => ({
  useLanguageModelProviders: jest.fn()
}));

jest.mock("../../../../stores/ProviderOnboardingStore", () => ({
  openProviderOnboarding: jest.fn()
}));

const mockOpenProviderOnboarding =
  openProviderOnboarding as jest.MockedFunction<typeof openProviderOnboarding>;

const mockUseLanguageModelProviders =
  useLanguageModelProviders as jest.MockedFunction<
    typeof useLanguageModelProviders
  >;

const renderWelcome = (onSuggestionClick = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WelcomePlaceholder onSuggestionClick={onSuggestionClick} />
    </ThemeProvider>
  );

describe("WelcomePlaceholder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("guides the user to add an API key when no provider is configured", () => {
    mockUseLanguageModelProviders.mockReturnValue({
      providers: [],
      isLoading: false,
      isFetching: false,
      error: null
    });

    renderWelcome();

    expect(
      screen.getByText("Connect an AI provider to get started")
    ).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Connect a provider/i })
    );
    expect(mockOpenProviderOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "generate_message" })
    );
  });

  it("offers openers the user finishes, not commands", () => {
    const onSuggestionClick = jest.fn();
    mockUseLanguageModelProviders.mockReturnValue({
      providers: [
        { provider: "openai", capabilities: ["generate_message"] }
      ],
      isLoading: false,
      isFetching: false,
      error: null
    });

    renderWelcome(onSuggestionClick);

    expect(screen.getByText("How can I help you today?")).toBeInTheDocument();
    expect(
      screen.getByText("Ask anything, drop in files, or start with one of these:")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connect an AI provider to get started")
    ).not.toBeInTheDocument();

    // Every opener either names what the user is about to attach or trails off
    // for them to finish — none of them commands a run on its own.
    expect(screen.getByText("Generate an image of …")).toBeInTheDocument();
    expect(screen.getByText("Build a workflow that …")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Summarize the document I attach"));
    expect(onSuggestionClick).toHaveBeenCalledWith(
      "Summarize the document I attach"
    );
  });

  it("keeps the neutral suggestions view while providers are loading", () => {
    mockUseLanguageModelProviders.mockReturnValue({
      providers: [],
      isLoading: true,
      isFetching: true,
      error: null
    });

    renderWelcome();

    expect(screen.getByText("How can I help you today?")).toBeInTheDocument();
    expect(
      screen.queryByText("Connect an AI provider to get started")
    ).not.toBeInTheDocument();
  });
});
