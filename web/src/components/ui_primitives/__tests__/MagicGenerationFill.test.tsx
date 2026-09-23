import { render, screen } from "@testing-library/react";

import MagicGenerationFill from "../MagicGenerationFill";

describe("MagicGenerationFill", () => {
  it("covers and clips to its positioned host, hidden from assistive tech", () => {
    render(<MagicGenerationFill data-testid="fill" />);
    const fill = screen.getByTestId("fill");
    const style = getComputedStyle(fill);
    expect(style.position).toBe("absolute");
    expect(style.overflow).toBe("hidden");
    expect(style.pointerEvents).toBe("none");
    expect(fill).toHaveAttribute("aria-hidden", "true");
  });

  it("applies the host's radius and stacking order", () => {
    render(
      <MagicGenerationFill data-testid="fill" borderRadius={6} zIndex={4} />
    );
    const fill = screen.getByTestId("fill");
    expect(fill.style.borderRadius).toBe("6px");
    expect(fill.style.zIndex).toBe("4");
  });

  it("adds a border only when framed", () => {
    const { rerender } = render(<MagicGenerationFill data-testid="fill" />);
    expect(getComputedStyle(screen.getByTestId("fill")).borderStyle).toBe("");

    rerender(<MagicGenerationFill data-testid="fill" framed />);
    expect(getComputedStyle(screen.getByTestId("fill")).borderStyle).toBe(
      "solid"
    );
  });
});
