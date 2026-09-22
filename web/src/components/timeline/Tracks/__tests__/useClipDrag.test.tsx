import { act, renderHook, fireEvent } from "@testing-library/react";
import { installGlobal } from "../../../../test-utils/doubles";
import { useClipDrag } from "../useClipDrag";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

if (!window.PointerEvent) {
  installGlobal(
    "PointerEvent",
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "touch";
      }
    }
  );
}

beforeEach(() => {
  document.elementsFromPoint = () => [];
  useTimelineStore.setState({
    tracks: [
      {
        id: "t1",
        name: "Track",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "a1",
        trackId: "t1",
        name: "Clip",
        startMs: 2000,
        durationMs: 1000,
        mediaType: "video",
        sourceType: "imported",
        status: "draft",
        locked: false,
        versions: []
      }
    ],
    durationMs: 12000
  });
  useTimelineUIStore.setState({
    msPerPx: 10,
    snapEnabled: false,
    selectedClipIds: new Set(),
    activeTool: "select"
  });
});

function setup(isPrimary = true) {
  const { result } = renderHook(() =>
    useClipDrag({
      clip: useTimelineStore.getState().clips[0],
      clipId: "a1",
      msPerPx: 10,
      activeTool: "select",
      interactionLocked: false,
      longPress: { start: jest.fn(), move: jest.fn(), cancel: jest.fn() }
    })
  );
  act(() =>
    result.current.handleDragPointerDown({
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 20,
      pointerId: 1,
      pointerType: "touch",
      isPrimary,
      currentTarget: document.createElement("div"),
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    } as unknown as React.PointerEvent<HTMLDivElement>)
  );
}

test("different touch pointer must not move the clip", () => {
  setup();
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: 230,
    clientY: 20,
    pointerId: 2,
    pointerType: "touch"
  });
  const actual = useTimelineStore.getState().clips[0].startMs;
  fireEvent.pointerUp(window, { pointerId: 1, pointerType: "touch" });
  expect(actual).toBe(2000);
});

test("different touch pointer ending must not end the clip drag", () => {
  setup();
  fireEvent.pointerUp(window, { pointerId: 2, pointerType: "touch" });
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: 130,
    clientY: 20,
    pointerId: 1,
    pointerType: "touch"
  });
  fireEvent.pointerUp(window, { pointerId: 1, pointerType: "touch" });
  expect(useTimelineStore.getState().clips[0].startMs).toBe(2300);
});

test("a secondary touch cannot start another clip drag", () => {
  setup(false);
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: 130,
    clientY: 20,
    pointerId: 1,
    pointerType: "touch"
  });
  fireEvent.pointerUp(window, { pointerId: 1, pointerType: "touch" });
  expect(useTimelineStore.getState().clips[0].startMs).toBe(2000);
});
