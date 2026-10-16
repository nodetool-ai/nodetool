/**
 * @jest-environment jsdom
 *
 * Study 4 E3-23: with the workspace Chats panel open on a 1440 px screen the
 * editor was about 940 px wide. That is above the mobile breakpoint, so the
 * right column and the docked assistant both stayed and the canvas was left
 * about 300 px. The editor closes the dock when it cannot fit beside a usable
 * canvas.
 */

import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import SketchEditor from "../SketchEditor";
import { SketchProvider } from "../../../stores/sketch/SketchInstance";
import { useSketchStore } from "../state/useSketchStore";

jest.mock("../../../hooks/useResolvedMediaUri");

jest.mock("../SketchAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="assistant-panel" />
}));

type Observed = { callback: ResizeObserverCallback; targets: Element[] };

describe("SketchEditor assistant dock", () => {
  const original = global.ResizeObserver;
  let observers: Observed[] = [];

  beforeEach(() => {
    observers = [];
    global.ResizeObserver = jest.fn().mockImplementation((callback) => {
      const entry: Observed = { callback, targets: [] };
      observers.push(entry);
      return {
        observe: (target: Element) => entry.targets.push(target),
        unobserve: jest.fn(),
        disconnect: jest.fn()
      };
    }) as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    global.ResizeObserver = original;
  });

  function resizeEditor(width: number) {
    const editor = document.querySelector(".sketch-editor");
    if (!editor) throw new Error("editor not mounted");
    act(() => {
      for (const { callback, targets } of observers) {
        if (targets.includes(editor)) {
          callback(
            [
              {
                target: editor,
                contentRect: { width, height: 800 }
              } as unknown as ResizeObserverEntry
            ],
            {} as ResizeObserver
          );
        }
      }
    });
  }

  it("closes the docked assistant when a side panel narrows the editor", () => {
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <SketchProvider>
          <SketchEditor documentId="assistant-dock-doc" />
        </SketchProvider>
      </ThemeProvider>
    );
    act(() => {
      useSketchStore.getState().setAssistantPanelOpen(true, { persist: false });
    });

    resizeEditor(1390);
    expect(view.queryByTestId("assistant-panel")).toBeInTheDocument();

    resizeEditor(940);
    expect(view.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    expect(useSketchStore.getState().assistantPanelOpen).toBe(false);
  });
});
