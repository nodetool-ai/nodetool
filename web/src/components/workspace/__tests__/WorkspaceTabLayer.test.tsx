import { render } from "@testing-library/react";
import WorkspaceTabLayer from "../WorkspaceTabLayer";

describe("WorkspaceTabLayer", () => {
  it("keeps an inactive tab mounted but inert, so it cannot take focus", () => {
    const { container } = render(
      <>
        <WorkspaceTabLayer active={true}>
          <input data-testid="active" />
        </WorkspaceTabLayer>
        <WorkspaceTabLayer active={false}>
          <input data-testid="hidden" />
        </WorkspaceTabLayer>
      </>
    );
    const [activeLayer, hiddenLayer] = Array.from(
      container.querySelectorAll(".tab-layer")
    );

    expect(activeLayer.hasAttribute("inert")).toBe(false);
    expect(hiddenLayer.hasAttribute("inert")).toBe(true);
    // Still mounted: editor state survives a tab switch.
    expect(hiddenLayer.querySelector("[data-testid=hidden]")).not.toBeNull();
  });

  it("drops inert when a tab becomes active", () => {
    const { container, rerender } = render(
      <WorkspaceTabLayer active={false}>x</WorkspaceTabLayer>
    );
    const layer = container.querySelector(".tab-layer") as HTMLElement;
    expect(layer.hasAttribute("inert")).toBe(true);

    rerender(<WorkspaceTabLayer active={true}>x</WorkspaceTabLayer>);
    expect(layer.hasAttribute("inert")).toBe(false);
  });
});
