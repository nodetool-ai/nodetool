import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { ImageRef, Scene, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Media sources resolve through TanStack Query; this suite renders no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");

const board: { shots: Shot[]; scenes: Scene[] } = { shots: [], scenes: [] };

jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  ...jest.requireActual("../../../stores/storyboard/StoryboardStore"),
  useBoard: () => ({
    shots: board.shots,
    screenplay: { scenes: board.scenes },
    aspectRatio: "16:9"
  })
}));

import StoryboardSlideshow, {
  DEFAULT_HOLD_SECONDS,
  slideHoldSeconds
} from "../StoryboardSlideshow";

const image = (id: string): ImageRef => ({
  type: "image",
  uri: `asset://${id}`,
  asset_id: id
});

const shot = (index: number, overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: `shot-${index}`,
  index,
  action: `Action ${index}`,
  status: "keyframe_ready",
  keyframe: image(`still-${index}`),
  ...overrides
});

const renderSlideshow = (
  props: Partial<React.ComponentProps<typeof StoryboardSlideshow>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardSlideshow boardId="board-1" onClose={jest.fn()} {...props} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.useFakeTimers();
  board.scenes = [
    { id: "scene-a", slugline: "INT. KITCHEN" } as Scene,
    { id: "scene-b", slugline: "EXT. BEACH" } as Scene
  ];
  board.shots = [
    shot(0, { scene_id: "scene-a", duration_seconds: 2 }),
    shot(1, { scene_id: "scene-a" }),
    shot(2, { scene_id: "scene-b", keyframe: undefined })
  ];
});

afterEach(() => {
  jest.useRealTimers();
});

describe("slideHoldSeconds", () => {
  it("holds a shot for its running time, or the default without one", () => {
    expect(slideHoldSeconds(shot(0, { duration_seconds: 5 }))).toBe(5);
    expect(slideHoldSeconds(shot(0))).toBe(DEFAULT_HOLD_SECONDS);
    expect(slideHoldSeconds(shot(0, { duration_seconds: 0 }))).toBe(
      DEFAULT_HOLD_SECONDS
    );
  });
});

describe("StoryboardSlideshow", () => {
  it("opens on the requested shot, numbered the way the cards are", () => {
    renderSlideshow({ startShotId: "shot-1" });
    expect(screen.getByText("Scene 1, Shot 2")).toBeInTheDocument();
    expect(screen.getByText("Action 1")).toBeInTheDocument();
  });

  it("steps with the arrows and the filmstrip, and gives unrendered shots a slide", () => {
    renderSlideshow();
    fireEvent.click(screen.getByLabelText("Autoplay"));

    fireEvent.click(screen.getByRole("button", { name: "Next shot" }));
    expect(screen.getByText("Scene 1, Shot 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Scene 2, Shot 1" }));
    expect(screen.getByText("Not rendered yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next shot" })).toBeDisabled();
  });

  it("autoplays through each shot's running time and stops on the last", () => {
    renderSlideshow();
    expect(screen.getByText("Scene 1, Shot 1")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Scene 1, Shot 2")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(DEFAULT_HOLD_SECONDS * 1000);
    });
    expect(screen.getByText("Scene 2, Shot 1")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Scene 2, Shot 1")).toBeInTheDocument();
  });

  it("hands the current shot to the editor and closes", () => {
    const onEditShot = jest.fn();
    const onClose = jest.fn();
    renderSlideshow({ startShotId: "shot-1", onEditShot, onClose });

    fireEvent.click(screen.getByRole("button", { name: "Edit shot" }));

    expect(onEditShot).toHaveBeenCalledWith("shot-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("offers no editing on a read-only board", () => {
    renderSlideshow();
    expect(
      screen.queryByRole("button", { name: "Edit shot" })
    ).not.toBeInTheDocument();
  });
});
