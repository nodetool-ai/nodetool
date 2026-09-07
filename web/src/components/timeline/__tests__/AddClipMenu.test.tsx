/**
 * AddClipMenu — "Adjustment layer" entry (T26).
 *
 * The heavy prompt-first UI (model selects, workflow lists) is stubbed out;
 * these tests only cover the adjustment-layer affordance: it appears on a
 * video/overlay track, is absent on tracks that can't carry an adjustment
 * clip, and clicking it creates a clip with `mediaType: "adjustment"` on the
 * requested track at the requested time.
 */

import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { TimelineTrack } from "@nodetool-ai/timeline";

// ── Network-backed sub-components → no-op stubs ─────────────────────────────

jest.mock("../../../trpc/client", () => ({
  trpc: {
    workflows: {
      list: {
        useQuery: () => ({ data: { workflows: [] }, isLoading: false })
      }
    },
    assets: {
      list: {
        useQuery: () => ({ data: { assets: [] }, isLoading: false })
      }
    }
  },
  trpcClient: {
    workflows: {
      terminalOutputs: { query: jest.fn() }
    }
  }
}));

jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="image-model-select" />
}));
jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="video-model-select" />
}));
jest.mock("../../properties/TTSModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="tts-model-select" />
}));

import { AddClipMenu } from "../AddClipMenu";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";

/** Mounts AddClipMenu with a real, mounted anchor element. */
function Harness({
  trackId,
  startMs,
  trackType
}: {
  trackId: string;
  startMs: number;
  trackType: TimelineTrack["type"];
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <div>
      <div ref={setAnchorEl} data-testid="anchor" />
      <AddClipMenu
        trackId={trackId}
        startMs={startMs}
        trackType={trackType}
        anchorEl={anchorEl}
        onClose={jest.fn()}
      />
    </div>
  );
}

const renderMenu = (props: React.ComponentProps<typeof Harness>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness {...props} />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineStore.setState({ tracks: [], clips: [] });
  useTimelineUIStore.getState().setSelection([]);
});

describe("AddClipMenu — adjustment layer", () => {
  it("offers an adjustment layer on a video track", () => {
    renderMenu({ trackId: "t1", startMs: 1000, trackType: "video" });
    expect(screen.getByTestId("add-clip-adjustment")).toBeTruthy();
    expect(screen.getByText("Adjustment layer")).toBeTruthy();
  });

  it("offers an adjustment layer on an overlay track", () => {
    renderMenu({ trackId: "t1", startMs: 1000, trackType: "overlay" });
    expect(screen.getByTestId("add-clip-adjustment")).toBeTruthy();
  });

  it("hides the adjustment layer entry on an audio track", () => {
    renderMenu({ trackId: "t1", startMs: 1000, trackType: "audio" });
    expect(screen.queryByTestId("add-clip-adjustment")).toBeNull();
  });

  it("creates an adjustment clip on the requested track at the playhead", async () => {
    const user = userEvent.setup();
    renderMenu({ trackId: "t1", startMs: 2500, trackType: "video" });

    await user.click(screen.getByTestId("add-clip-adjustment"));

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toEqual(
      expect.objectContaining({
        mediaType: "adjustment",
        trackId: "t1",
        startMs: 2500
      })
    );
  });

  it("selects the new adjustment clip", async () => {
    const user = userEvent.setup();
    renderMenu({ trackId: "t1", startMs: 0, trackType: "video" });

    await user.click(screen.getByTestId("add-clip-adjustment"));

    const clip = useTimelineStore.getState().clips[0];
    expect(useTimelineUIStore.getState().selectedClipIds.has(clip.id)).toBe(
      true
    );
  });
});
