import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";
import type { Message, MessageContent } from "../../../../stores/ApiTypes";
import {
  cssAspectRatio,
  extractGenerationTurns,
  inferMediaCategory
} from "../extractGenerationTurns";
import ImageGenerationFeed from "../ImageGenerationFeed";
import VideoGenerationFeed from "../VideoGenerationFeed";
import AudioGenerationFeed from "../AudioGenerationFeed";

jest.mock("../../../node/ImageView", () => ({
  __esModule: true,
  default: ({ source }: { source: string }) => (
    <img data-testid="mock-image-view" src={source} alt="generated" />
  )
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>
    </QueryClientProvider>
  );
}

describe("extractGenerationTurns & inferMediaCategory", () => {
  it("infers media category from explicit thread mode or message history", () => {
    expect(inferMediaCategory("image", [])).toBe("image");
    expect(inferMediaCategory("image_edit", [])).toBe("image");
    expect(inferMediaCategory("video", [])).toBe("video");
    expect(inferMediaCategory("extend", [])).toBe("video");
    expect(inferMediaCategory("audio", [])).toBe("audio");
    expect(inferMediaCategory("music", [])).toBe("audio");
    expect(inferMediaCategory("chat", [])).toBeNull();

    const imageMessages: Message[] = [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "A neon sign" }],
        media_generation: { mode: "image", model: "flux-pro" }
      }
    ];
    expect(inferMediaCategory(undefined, imageMessages)).toBe("image");
  });

  it("pairs user and assistant messages into generation turns", () => {
    const assistantContent: MessageContent[] = [
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/1.png", asset_id: "asset1" }
      },
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/2.png", asset_id: "asset2" }
      }
    ];
    const messages: Message[] = [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "Wood-fired pizza truck" }],
        media_generation: {
          mode: "image",
          model: "gpt-image-2",
          aspect_ratio: "16:9",
          resolution: "2K"
        }
      },
      {
        id: "a1",
        role: "assistant",
        content: assistantContent
      }
    ];

    const turns = extractGenerationTurns(messages, "connected");
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toBe("Wood-fired pizza truck");
    expect(turns[0].imageOutputs).toHaveLength(2);
    expect(turns[0].isPending).toBe(false);
    expect(cssAspectRatio(turns[0].mediaGeneration?.aspect_ratio)).toBe(
      "16 / 9"
    );
  });
});

describe("ImageGenerationFeed", () => {
  it("renders full-bleed tiled images and pending tiles", () => {
    const assistantContent: MessageContent[] = [
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/1.png", asset_id: "asset1" }
      },
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/2.png", asset_id: "asset2" }
      }
    ];
    const messages: Message[] = [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "Wood-fired pizza truck" }],
        media_generation: {
          mode: "image",
          model: "GPT Image 2",
          resolution: "2K",
          aspect_ratio: "16:9",
          variations: 2
        }
      },
      {
        id: "a1",
        role: "assistant",
        content: assistantContent
      },
      {
        id: "u2",
        role: "user",
        content: [{ type: "text", text: "Candlelit dinner table" }],
        media_generation: {
          mode: "image",
          variations: 2
        }
      }
    ];

    renderWithProviders(
      <ImageGenerationFeed
        messages={messages}
        status="loading"
        threadId="thread-img"
      />
    );

    expect(screen.getAllByTestId("image-generation-tile")).toHaveLength(2);
    expect(
      screen.getAllByTestId("image-generation-pending-tile")
    ).toHaveLength(2);
  });
});

describe("VideoGenerationFeed", () => {
  it("renders split video cards in list view and switches to grid view", () => {
    const messages: Message[] = [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "Condensation forms on the can" }],
        media_generation: {
          mode: "video",
          model: "Kling 3.0",
          resolution: "720p",
          duration: 5,
          aspect_ratio: "16:9"
        }
      },
      {
        id: "a1",
        role: "assistant",
        content: [
          {
            type: "video",
            video: { type: "video", uri: "https://example.com/clip.mp4" }
          }
        ]
      }
    ];

    renderWithProviders(
      <VideoGenerationFeed
        messages={messages}
        status="connected"
        threadId="thread-vid"
      />
    );

    expect(screen.getByTestId("video-generation-card")).toBeInTheDocument();
    expect(screen.getByText("Kling 3.0")).toBeInTheDocument();
    expect(
      screen.getByText("Condensation forms on the can")
    ).toBeInTheDocument();

    const gridBtn = screen.getByRole("button", { name: /grid/i });
    fireEvent.click(gridBtn);
    expect(screen.getByTestId("video-generation-card")).toBeInTheDocument();
  });
});

describe("AudioGenerationFeed", () => {
  it("renders date-grouped horizontal audio rows", () => {
    const messages: Message[] = [
      {
        id: "u1",
        role: "user",
        created_at: "2026-10-14T12:00:00Z",
        content: [{ type: "text", text: "Driftline. Sparkling water." }],
        media_generation: {
          mode: "audio",
          model: "Seed Audio 1.0",
          voice: "nova"
        }
      },
      {
        id: "a1",
        role: "assistant",
        created_at: "2026-10-14T12:00:05Z",
        content: [
          {
            type: "audio",
            audio: { type: "audio", uri: "https://example.com/voice.mp3" }
          }
        ]
      }
    ];

    renderWithProviders(
      <AudioGenerationFeed messages={messages} status="connected" />
    );

    expect(screen.getByTestId("audio-generation-row")).toBeInTheDocument();
    expect(screen.getByText("Seed Audio 1.0")).toBeInTheDocument();
    expect(screen.getByText("Driftline. Sparkling water.")).toBeInTheDocument();
    expect(screen.getByText("nova")).toBeInTheDocument();
  });
});
