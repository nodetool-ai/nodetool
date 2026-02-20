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

  it("should apply correct CSS classes", () => {
    const { container } = render(<DataFlowParticles isActive={true} />);
    const particlesContainer = container.querySelector(".data-flow-particles");
    expect(particlesContainer).toHaveClass("data-flow-particles");
  });

  it("should render three particle elements", () => {
    const { container } = render(<DataFlowParticles isActive={true} />);
    const particles = container.querySelectorAll("circle");
    expect(particles).toHaveLength(3);
    expect(particles[0]).toHaveClass("particle-1");
    expect(particles[1]).toHaveClass("particle-2");
    expect(particles[2]).toHaveClass("particle-3");
  });

  it("should have correct particle attributes", () => {
    const { container } = render(<DataFlowParticles isActive={true} />);
    const particle = container.querySelector(".particle-1") as SVGCircleElement;
    expect(particle.getAttribute("r")).toBe("3");
    expect(particle.getAttribute("opacity")).toBe("0.9");
  });
});
