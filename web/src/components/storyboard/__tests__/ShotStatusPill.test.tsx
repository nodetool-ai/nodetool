/**
 * F18: a shot with a still and no clip must not claim a clip render is
 * queued unless one actually is.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

import ShotStatusPill, { shotPill } from "../ShotStatusPill";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Shot",
  action: "",
  status: "keyframe_ready",
  keyframe: { type: "image", uri: "http://example.com/still.png" },
  ...overrides
});

const renderPill = (shot: Shot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotStatusPill shot={shot} />
    </ThemeProvider>
  );

beforeEach(() => {
  useStoryboardGenerationStore.setState({
    shotJobs: {},
    jobToShot: {},
    generatingShotIds: [],
    failedShotIds: []
  });
});

describe("shotPill", () => {
  it("does not claim a clip is queued when no job is running", () => {
    expect(shotPill(makeShot())).toEqual({ tone: "neutral", label: "still" });
  });

  it("says clip queued only while a clip job is actually queued or running", () => {
    expect(shotPill(makeShot(), "queued")).toEqual({
      tone: "neutral",
      label: "still · clip queued"
    });
    expect(shotPill(makeShot(), "running")).toEqual({
      tone: "neutral",
      label: "still · clip queued"
    });
    expect(shotPill(makeShot(), "failed")).toEqual({
      tone: "neutral",
      label: "still"
    });
    expect(shotPill(makeShot(), "completed")).toEqual({
      tone: "neutral",
      label: "still"
    });
  });
});

describe("ShotStatusPill", () => {
  it("reads a neutral 'still' label when no render has been requested", () => {
    renderPill(makeShot());
    expect(screen.getByText("still")).toBeInTheDocument();
  });

  it("reads 'still · clip queued' while the shot's own job is queued", () => {
    useStoryboardGenerationStore.setState({
      shotJobs: {
        "shot-1": {
          shotId: "shot-1",
          boardId: "board-1",
          jobId: "job-1",
          kind: "clip",
          status: "queued"
        }
      },
      jobToShot: { "job-1": "shot-1" }
    });
    renderPill(makeShot());
    expect(screen.getByText("still · clip queued")).toBeInTheDocument();
  });
});
