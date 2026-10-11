import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  getTimelineTemporal,
  useTimelineStore
} from "../../../../stores/timeline/TimelineStore";
import { ClipTextStyleSection } from "../ClipTextStyleSection";

jest.mock("../../../../trpc/client", () => ({
  trpcClient: { fonts: { list: { query: async () => [] } } }
}));

const track = makeTrack({ type: "video", name: "V1" });
const seeded = makeClip({
  id: "clip_text",
  trackId: track.id,
  mediaType: "text",
  sourceType: "imported",
  startMs: 0,
  durationMs: 2000,
  textStyle: { text: "Hi", fontSizePx: 48, color: "#ffffff" }
});

const StoreBoundSection = () => {
  const clip = useTimelineStore((s) =>
    s.clips.find((candidate) => candidate.id === seeded.id)
  );
  if (!clip?.textStyle) return null;
  return <ClipTextStyleSection clip={clip} textStyle={clip.textStyle} />;
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "nodetool.timeline.inspector.fold",
    JSON.stringify({ text: true })
  );
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [seeded] });
    getTimelineTemporal().clear();
  });
});

describe("ClipTextStyleSection text content", () => {
  it("records one undo entry for a typing session", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <StoreBoundSection />
        </QueryClientProvider>
      </ThemeProvider>
    );

    await user.type(screen.getByLabelText("Text content"), " there");
    await user.tab();

    expect(
      useTimelineStore.getState().clips[0].textStyle?.text
    ).toBe("Hi there");
    expect(getTimelineTemporal().pastStates).toHaveLength(1);

    act(() => getTimelineTemporal().undo());
    expect(useTimelineStore.getState().clips[0].textStyle?.text).toBe("Hi");
  });
});
