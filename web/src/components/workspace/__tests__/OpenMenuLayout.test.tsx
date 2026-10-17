/**
 * The root view sets guided flows and blank documents side by side from `md`
 * up, because one column was cut at 1280×800 and hid "New 3D model" (UX study
 * 7). Column CSS is checked in a browser; this suite pins the markers it
 * hangs on and the row keys that let a submenu replace the root rows.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockGuidedStarters, renderOpenMenu } from "../openMenuTestHarness";

describe("OpenMenu layout", () => {
  beforeEach(() => {
    // Ids that are also blank-document keys, as the real starters are.
    mockGuidedStarters.value = ["workflow", "image", "app"].map((id) => ({
      id,
      title: `Guided ${id}`,
      description: `Start a ${id}`,
      start: jest.fn()
    }));
  });

  afterEach(() => {
    mockGuidedStarters.value = [];
  });

  it("starts the blank documents in their own column", () => {
    renderOpenMenu();

    expect(screen.getByText("Blank documents")).toHaveClass(
      "open-menu-blank-section"
    );
    expect(screen.getByText("New 3D model")).toBeInTheDocument();
  });

  it("replaces every root row when a submenu opens", async () => {
    renderOpenMenu();

    await userEvent.click(screen.getByText("New text file…"));

    expect(screen.getByText("Markdown (.md)")).toBeInTheDocument();
    expect(screen.queryByText("Guided workflow")).toBeNull();
    expect(screen.queryByText("Guided image")).toBeNull();
    expect(screen.queryByText("Guided app")).toBeNull();
  });
});
