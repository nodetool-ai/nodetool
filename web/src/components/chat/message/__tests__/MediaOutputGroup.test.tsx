import React from "react";
import { stub } from "../../../../test-utils/doubles";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import MediaOutputGroup from "../MediaOutputGroup";
import type { Message, MessageContent } from "../../../../stores/ApiTypes";

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("../../../../stores/BASE_URL", () => ({
  BASE_URL: "https://api.test",
  prefixBaseUrl: (url: string) => `https://api.test${url}`
}));

jest.mock("../../../../hooks/handlers/useGenerationToCanvas", () => ({
  useAddMediaToCanvas: () => ({
    isCanvasAvailable: false,
    addBlocksToCanvas: jest.fn()
  })
}));

const message = stub<Message>({
  id: "m1",
  role: "assistant",
  type: "message",
  content: [],
  media_generation: { mode: "image", model: "flux", provider: "fal_ai" }
});

const renderGroup = (mediaContents: MessageContent[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MediaOutputGroup message={message} mediaContents={mediaContents} />
    </ThemeProvider>
  );

describe("MediaOutputGroup", () => {
  it("prefixes a relative storage uri with BASE_URL for video and audio", () => {
    renderGroup(stub<MessageContent[]>([
      { type: "video", video: { type: "video", uri: "/api/storage/u1/v.mp4" } },
      { type: "audio", audio: { type: "audio", uri: "/api/storage/u1/a.wav" } }
    ]));

    expect(screen.getByLabelText("Generated video")).toHaveAttribute(
      "src",
      "https://api.test/api/storage/u1/v.mp4"
    );
    expect(screen.getByLabelText("Generated audio")).toHaveAttribute(
      "src",
      "https://api.test/api/storage/u1/a.wav"
    );
  });

  it("passes a signed absolute uri through unchanged", () => {
    renderGroup(stub<MessageContent[]>([
      {
        type: "video",
        video: { type: "video", uri: "https://cdn.test/u1/v.mp4?token=sig" }
      }
    ]));

    expect(screen.getByLabelText("Generated video")).toHaveAttribute(
      "src",
      "https://cdn.test/u1/v.mp4?token=sig"
    );
  });
});
