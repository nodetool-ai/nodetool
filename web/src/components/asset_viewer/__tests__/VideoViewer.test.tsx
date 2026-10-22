import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import VideoViewer from "../VideoViewer";

const renderViewer = (asset?: Asset) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <VideoViewer asset={asset} url="https://example.com/clip.mp4" />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("VideoViewer", () => {
  it("names the video after the asset", () => {
    const { container } = renderViewer({
      name: "intro.mp4",
      get_url: "https://example.com/intro.mp4"
    } as Asset);
    expect(container.querySelector("video")).toHaveAttribute(
      "aria-label",
      "intro.mp4"
    );
  });

  it("falls back to a generic name without an asset", () => {
    const { container } = renderViewer();
    expect(container.querySelector("video")).toHaveAttribute(
      "aria-label",
      "Video"
    );
  });
});
