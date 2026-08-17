import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardCommandBar from "../DashboardCommandBar";
import { WELCOME_TRACKS } from "../welcomeTracks";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";

const renderBar = (
  props: Partial<React.ComponentProps<typeof DashboardCommandBar>> = {}
) => {
  const onSubmit = jest.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DashboardCommandBar onSubmit={onSubmit} {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { onSubmit };
};

describe("DashboardCommandBar", () => {
  it("cannot send an empty prompt", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("sends what the user typed, in the default track", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "a poster for a jazz night"
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith("agent", "a poster for a jazz night");
  });

  it("sends on Enter", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "hello{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith("agent", "hello");
  });

  it("routes a typed prompt to the chosen track", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "a fox in snow"
    );
    await user.click(screen.getByRole("button", { name: "Image" }));
    // Choosing a track with a prompt typed selects, it does not send.
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith("image", "a fox in snow");
  });

  // Choosing a kind is also how you reach that kind's model, so the click has
  // to leave the user on the dashboard rather than opening a chat.
  it("writes a track's own example into the box when it is empty", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.click(screen.getByRole("button", { name: "Video" }));

    const video = WELCOME_TRACKS.find((t) => t.id === "video");
    expect(screen.getByLabelText("Describe what you want to make")).toHaveValue(
      video?.samplePrompt
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves a typed prompt alone when a kind is chosen", async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByLabelText("Describe what you want to make");

    await user.type(input, "my own idea");
    await user.click(screen.getByRole("button", { name: "Video" }));

    expect(input).toHaveValue("my own idea");
  });

  it("hides the track chips where the host already shows starter cards", () => {
    renderBar({ showModes: false });
    expect(screen.queryByRole("button", { name: "Image" })).toBeNull();
  });

  describe("model chip", () => {
    it("says so when the track has no model chosen", () => {
      useMediaGenerationStore.getState().setImageParams({ model: null });
      renderBar();
      expect(screen.getByTitle("Model for agent")).toBeInTheDocument();
    });

    it("names the chat model for the agent track", () => {
      useGlobalChatStore.setState({
        selectedModel: {
          type: "language_model",
          provider: "anthropic",
          id: "claude-sonnet-5",
          name: "Claude Sonnet 5"
        }
      });
      renderBar();
      expect(screen.getByTitle("Model for agent")).toHaveTextContent(
        "Claude Sonnet 5"
      );
    });

    // Each track reads its own store, so switching kind switches the model
    // shown — that is the whole point of the chip sitting next to the chips.
    it("follows the chosen track to that track's own model", async () => {
      const user = userEvent.setup();
      useGlobalChatStore.setState({
        selectedModel: {
          type: "language_model",
          provider: "anthropic",
          id: "claude-sonnet-5",
          name: "Claude Sonnet 5"
        }
      });
      useMediaGenerationStore.getState().setImageParams({
        model: {
          type: "image_model",
          provider: "fal_ai",
          id: "fal-ai/flux/schnell",
          name: "FLUX schnell",
          path: ""
        }
      });
      renderBar();

      expect(screen.getByTitle("Model for agent")).toHaveTextContent(
        "Claude Sonnet 5"
      );

      await user.click(screen.getByRole("button", { name: "Image" }));

      expect(screen.getByTitle("Model for image")).toHaveTextContent(
        "FLUX schnell"
      );
    });

    it("is offered even where the track chips are hidden", () => {
      renderBar({ showModes: false });
      expect(screen.getByTitle("Model for agent")).toBeInTheDocument();
    });
  });
});
