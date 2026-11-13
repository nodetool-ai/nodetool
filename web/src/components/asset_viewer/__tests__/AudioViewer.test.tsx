import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import AudioViewer from "../AudioViewer";

jest.mock("../../audio/AudioPlayer", () => ({
  __esModule: true,
  default: ({ source }: { source: string }) => (
    <div data-testid="audio-player" data-source={source} />
  )
}));

describe("AudioViewer", () => {
  it("plays the asset and leaves its name to the document bar", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioViewer
          asset={
            {
              name: "Interview take 3.wav",
              content_type: "audio/wav",
              get_url: "https://example.com/take3.wav"
            } as Asset
          }
        />
      </ThemeProvider>
    );
    expect(screen.getByTestId("audio-player")).toHaveAttribute(
      "data-source",
      "https://example.com/take3.wav"
    );
    expect(screen.queryByText("Interview take 3.wav")).not.toBeInTheDocument();
  });
});
