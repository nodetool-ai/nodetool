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
    expect(paper).toHaveStyle({ maxHeight: "calc(100vh - 64px)" });
  });
});
