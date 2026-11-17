import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import WelcomePlaceholder from "../WelcomePlaceholder";
import { useLanguageModelProviders } from "../../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../../stores/ProviderOnboardingStore";
import useAuth from "../../../../stores/useAuth";

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

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByText("Connect an AI provider to get started")
    ).not.toBeInTheDocument();

    // Every opener names a job the studio is built for and trails off for the
    // user to finish — none of them commands a run on its own.
    expect(
      screen.getByText("Direct a UGC-style testimonial for …")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Build a workflow that renders an ad for every …")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Storyboard a 30-second ad for …"));
    expect(onSuggestionClick).toHaveBeenCalledWith(
      "Storyboard a 30-second ad for …"
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

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByText("Connect an AI provider to get started")
    ).not.toBeInTheDocument();
  });

  describe("greeting", () => {
    beforeEach(() => {
      mockUseLanguageModelProviders.mockReturnValue({
        providers: [{ provider: "openai", capabilities: ["generate_message"] }],
        isLoading: false,
        isFetching: false,
        error: null
      });
    });
    afterEach(() => {
      jest.restoreAllMocks();
      useAuth.setState({ user: null });
    });

    it("greets the user by the time of day and first name, as Claude does", () => {
      jest.spyOn(Date.prototype, "getHours").mockReturnValue(19);
      useAuth.setState({
        user: {
          id: "user-1",
          user_metadata: { given_name: "Matthias", full_name: "Matthias Georgi" }
        } as never
      });

      renderWelcome();

      expect(
        screen.getByRole("heading", { level: 1, name: "Good evening, Matthias" })
      ).toBeInTheDocument();
    });

    it("greets without a name when the account has none", () => {
      jest.spyOn(Date.prototype, "getHours").mockReturnValue(8);
      useAuth.setState({ user: { id: "local" } });

      renderWelcome();

      expect(
        screen.getByRole("heading", { level: 1, name: "Good morning" })
      ).toBeInTheDocument();
    });
  });
});
