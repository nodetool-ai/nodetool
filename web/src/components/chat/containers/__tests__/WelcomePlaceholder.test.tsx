import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import WelcomePlaceholder from "../WelcomePlaceholder";
import { useLanguageModelProviders } from "../../../../hooks/useProviders";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate
}));

jest.mock("../../../../hooks/useProviders", () => ({
  useLanguageModelProviders: jest.fn()
}));

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
      screen.getByRole("button", { name: /Add API keys in Settings/i })
    );
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=1");
  });

  it("shows prompt suggestions once a provider is configured", () => {
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
      screen.queryByText("Connect an AI provider to get started")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Summarize a document"));
    expect(onSuggestionClick).toHaveBeenCalledWith("Summarize a document");
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
