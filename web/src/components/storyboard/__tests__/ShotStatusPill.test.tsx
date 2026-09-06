/**
 * F18: a shot with a still and no clip must not claim a clip render is
 * queued unless one actually is.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { BoardRenderContext, Shot } from "@nodetool-ai/protocol";
import { currentRenderInputs, stampRenderInputs } from "@nodetool-ai/protocol";
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

const renderPill = (shot: Shot, renderContext?: BoardRenderContext) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotStatusPill shot={shot} renderContext={renderContext} />
    </ThemeProvider>
  );

const board = (imageModel: string): BoardRenderContext => ({
  aspect_ratio: "16:9",
  image_model: imageModel,
  video_model: "video-model",
  style_entity_id: null,
  style: "noir",
  scenes: null
});

/** A shot whose selected still records the inputs `on` would render with. */
const shotRenderedOn = (
  on: BoardRenderContext,
  overrides: Partial<Shot> = {}
) => {
  const shot = makeShot(overrides);
  const keyframe = {
    ...(shot.keyframe as { type: "image"; uri: string }),
    render_inputs: stampRenderInputs(currentRenderInputs(shot, on, "keyframe"))
  };
  return { ...shot, keyframe };
};

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

  // A shot fused into a sibling's generation has its picture but no clip of
  // its own. "still" reads as a shot nobody has rendered yet, which is what
  // sent a finished cut back round for a second render.
  it("says a shot is covered rather than still waiting on a clip", () => {
    expect(
      shotPill(
        makeShot({
          status: "rendered",
          covered_by: { shot_id: "shot-0", start_seconds: 2.5 }
        })
      )
    ).toEqual({ tone: "neutral", label: "covered" });
  });

  it("says nothing for a shot that has its own clip, covered or not", () => {
    expect(
      shotPill(
        makeShot({
          status: "rendered",
          clip: { type: "video", uri: "http://example.com/clip.mp4" }
        })
      )
    ).toBeNull();
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

describe("ShotStatusPill staleness", () => {
  const rendered = board("image-model-a");

  it("marks a still whose render record no longer matches the board", () => {
    const shot = shotRenderedOn(rendered);
    renderPill(shot, board("image-model-b"));
    expect(screen.getByTestId("shot-status-pill")).toHaveTextContent(
      "still · stale"
    );
  });

  it("says nothing about staleness while the record still matches", () => {
    const shot = shotRenderedOn(rendered);
    renderPill(shot, rendered);
    expect(screen.getByTestId("shot-status-pill")).toHaveTextContent("still");
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
  });

  it("stands alone on a finished shot, which has no lifecycle to show", () => {
    const shot = {
      ...shotRenderedOn(rendered),
      status: "rendered" as const,
      clip: { type: "video" as const, uri: "http://example.com/clip.mp4" }
    };
    renderPill(shot, board("image-model-b"));
    expect(screen.getByTestId("shot-status-pill")).toHaveTextContent("stale");
  });

  it("shows the lifecycle alone when no board context is passed", () => {
    renderPill(shotRenderedOn(rendered));
    expect(screen.getByTestId("shot-status-pill")).toHaveTextContent("still");
  });
});
