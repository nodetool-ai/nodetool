import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import PortalSetupFlow from "../PortalSetupFlow";
import useSecretsStore from "../../../stores/SecretsStore";

jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockUpdateSecret = jest.fn();

const renderSetup = (
  props: Partial<React.ComponentProps<typeof PortalSetupFlow>> = {}
) => {
  const onComplete = props.onComplete ?? jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <PortalSetupFlow {...props} onComplete={onComplete} />
    </ThemeProvider>
  );
  return { onComplete };
};

describe("PortalSetupFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSecretsStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({ updateSecret: mockUpdateSecret })
    );
  });

  it("renders OpenAI, Anthropic, and local options", () => {
    renderSetup();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Run locally")).toBeInTheDocument();
  });

  it("shows a contextual message when provided", () => {
    renderSetup({ message: "Your Image starter needs a model to run." });
    expect(
      screen.getByText("Your Image starter needs a model to run.")
    ).toBeInTheDocument();
  });

  it("expands a provider to show the key input and a get-key link", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByText("OpenAI"));
    expect(
      screen.getByPlaceholderText("OpenAI API Key")
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /get a openai api key/i });
    expect(link).toHaveAttribute(
      "href",
      "https://platform.openai.com/api-keys"
    );
  });

  it("saves the key and completes with the provider default model", async () => {
    mockUpdateSecret.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onComplete } = renderSetup();

    await user.click(screen.getByText("Anthropic"));
    await user.type(
      screen.getByPlaceholderText("Anthropic API Key"),
      "sk-ant-test"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-ant-test"
      );
      expect(onComplete).toHaveBeenCalledWith(
        "anthropic:claude-sonnet-4-20250514"
      );
    });
  });

  it("shows an inline error when saving the key fails", async () => {
    mockUpdateSecret.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    const { onComplete } = renderSetup();

    await user.click(screen.getByText("OpenAI"));
    await user.type(screen.getByPlaceholderText("OpenAI API Key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/couldn't save the key/i)
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("renders a back button only when onBack is provided", async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    renderSetup({ onBack });
    const back = screen.getByRole("button", { name: /back to dashboard/i });
    await user.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the back button without onBack", () => {
    renderSetup();
    expect(
      screen.queryByRole("button", { name: /back to dashboard/i })
    ).not.toBeInTheDocument();
  });

  it("hides track-only providers when no track is pending", () => {
    renderSetup();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
    expect(screen.queryByText("Hugging Face")).not.toBeInTheDocument();
  });

  it("recommends Gemini first for the video track", () => {
    renderSetup({ trackId: "video" });
    const providerRows = screen
      .getAllByRole("button")
      .filter((row) => row.textContent?.includes("Connect →"));
    expect(providerRows[0]).toHaveTextContent("Google Gemini");
    expect(providerRows[0]).toHaveTextContent("Recommended");
  });

  it("offers Hugging Face for the image track and completes without a chat model", async () => {
    mockUpdateSecret.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onComplete } = renderSetup({ trackId: "image" });

    await user.click(screen.getByText("Hugging Face"));
    await user.type(
      screen.getByPlaceholderText("Hugging Face API Key"),
      "hf_test"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateSecret).toHaveBeenCalledWith("HF_TOKEN", "hf_test");
      expect(onComplete).toHaveBeenCalledWith(null);
    });
  });
});
