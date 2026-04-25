/**
 * Tests for DataFlowParticles experimental component
 */

import { render } from "@testing-library/react";
import { DataFlowParticles } from "../DataFlowParticles";

describe("DataFlowParticles", () => {
  it("should render nothing when not active", () => {
    const { container } = render(<DataFlowParticles isActive={false} />);
    expect(container.firstChild).toBe(null);
  });

  it("should render particles when active", () => {
    const { container } = render(<DataFlowParticles isActive={true} />);
    expect(container.querySelector(".data-flow-particles")).toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

});
