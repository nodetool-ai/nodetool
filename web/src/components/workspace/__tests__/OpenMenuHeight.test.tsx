/**
 * The menu grows to the bottom of the window. A fixed 70vh cap hid most
 * blank documents at 1280×720 with no cue to scroll (UX study 1, I6).
 */
import { screen } from "@testing-library/react";

import { renderOpenMenu } from "../openMenuTestHarness";

describe("OpenMenu height", () => {
  it("fills the window below its anchor", () => {
    jest
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ bottom: 47.5 } as DOMRect);

    renderOpenMenu();

    const paper = screen.getByRole("menu").closest(".MuiPaper-root");
    expect(paper).toHaveStyle({ maxHeight: `${window.innerHeight - 64}px` });
  });

  it("stops above the status bar", () => {
    jest
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ bottom: 47.5 } as DOMRect);
    const statusBar = document.createElement("div");
    statusBar.className = "panel-tabbar";
    statusBar.getBoundingClientRect = () => ({ top: 680, height: 32 }) as DOMRect;
    document.body.appendChild(statusBar);

    try {
      renderOpenMenu();

      const paper = screen.getByRole("menu").closest(".MuiPaper-root");
      expect(paper).toHaveStyle({ maxHeight: "616px" });
    } finally {
      statusBar.remove();
    }
  });

  it("ignores a hidden status bar on phones", () => {
    jest
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ bottom: 95.5 } as DOMRect);
    const statusBar = document.createElement("div");
    statusBar.className = "panel-tabbar";
    statusBar.getBoundingClientRect = () =>
      ({ top: 0, height: 0 }) as DOMRect;
    document.body.appendChild(statusBar);

    try {
      renderOpenMenu();

      const paper = screen.getByRole("menu").closest(".MuiPaper-root");
      expect(paper).toHaveStyle({ maxHeight: `${window.innerHeight - 112}px` });
    } finally {
      statusBar.remove();
    }
  });
});
