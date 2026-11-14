import { asMock } from "../../../test-utils/doubles";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import QueueOverlay from "../QueueOverlay";
import { Job } from "../../../stores/ApiTypes";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import {
  queueOverlayPositionKey,
  useQueueOverlayPositionStore
} from "../../../stores/QueueOverlayPositionStore";

jest.mock("../../../hooks/useRunningJobs", () => ({
  useRunningJobs: jest.fn()
}));

jest.mock("../../../serverState/useWorkflow", () => ({
  useWorkflow: jest.fn(() => ({ data: { name: "WF" } }))
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() })
}));

jest.mock("../../../trpc/client", () => ({
  trpcClient: { jobs: { cancel: { mutate: jest.fn().mockResolvedValue({}) } } }
}));

const KEY = queueOverlayPositionKey(null);

const running: Job = {
  id: "a",
  user_id: "u",
  job_type: "workflow",
  workflow_id: "wf-a",
  status: "running",
  started_at: "2026-05-29T12:00:00Z"
} as Job;

// The canvas the overlay floats over: 950 x 600 px starting below the bars.
const canvas = document.createElement("div");
canvas.getBoundingClientRect = () =>
  ({ left: 50, top: 76, right: 1000, bottom: 676, width: 950, height: 600, x: 50, y: 76, toJSON: () => ({}) }) as DOMRect;

const renderOverlay = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueueOverlay canvas={canvas} />
    </ThemeProvider>
  );

const panel = () =>
  screen.getByRole("button", { name: /move queue/i }).closest("[data-state]") as HTMLElement;

/** Pointer events with coordinates; jsdom has no PointerEvent constructor. */
const pointer = (type: string, target: Element, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  act(() => {
    target.dispatchEvent(event);
  });
};

describe("QueueOverlay position", () => {
  beforeEach(() => {
    localStorage.clear();
    useQueueOverlayPositionStore.setState({ positions: {} });
    asMock(useRunningJobs).mockReturnValue({ data: [running], isLoading: false, error: null });
  });

  it("starts at the canvas's top-left corner, below the document bar", () => {
    renderOverlay();
    expect(panel().style.left).toBe("66px");
    expect(panel().style.top).toBe("92px");
    expect(panel().style.width).toBe("304px");
  });

  it("drags by the grip and keeps the drop for the user", () => {
    renderOverlay();
    const grip = screen.getByRole("button", { name: /move queue/i });
    pointer("pointerdown", grip, 70, 100);
    pointer("pointermove", grip, 600, 400);
    expect(panel().style.left).toBe("596px");
    pointer("pointerup", grip, 600, 400);

    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toMatchObject({
      anchorX: "right",
      anchorY: "bottom"
    });
    expect(panel().style.left).toBe("596px");
  });

  it("does not start a drag from the expand button", () => {
    renderOverlay();
    const expand = screen.getByRole("button", { name: /expand queue/i });
    pointer("pointerdown", expand, 300, 100);
    pointer("pointermove", expand, 600, 400);
    pointer("pointerup", expand, 600, 400);
    expect(panel().style.left).toBe("66px");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("restores a saved position and clamps it inside the canvas", () => {
    localStorage.setItem(KEY, JSON.stringify({ anchorX: "left", anchorY: "top", x: 5000, y: 20 }));
    renderOverlay();
    expect(panel().style.left).toBe(`${1000 - 16 - 304}px`);
    expect(panel().style.top).toBe("96px");
  });

  it("moves with the arrow keys and returns to the default with Home", () => {
    renderOverlay();
    const grip = screen.getByRole("button", { name: /move queue/i });
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(panel().style.left).toBe("82px");
    fireEvent.keyDown(grip, { key: "ArrowDown", shiftKey: true });
    expect(panel().style.top).toBe("156px");
    fireEvent.keyDown(grip, { key: "Home" });
    expect(panel().style.left).toBe("66px");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
