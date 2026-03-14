import React from "react";
import { render } from "@testing-library/react";
import { LoadingIndicator } from "../LoadingIndicator";

describe("LoadingIndicator", () => {
  describe("default rendering", () => {
    it("renders with default accessibility attributes", () => {
      const { container } = render(<LoadingIndicator />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toBeInTheDocument();
      expect(statusContainer).toHaveAttribute("aria-live", "polite");
      expect(statusContainer).toHaveAttribute("aria-label", "Loading");
    });

    it("renders with loading-container class", () => {
      const { container } = render(<LoadingIndicator />);

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toBeInTheDocument();
    });

    it("renders svg with aria-hidden attribute", () => {
      const { container } = render(<LoadingIndicator />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });

    it("renders core div with aria-hidden attribute", () => {
      const { container } = render(<LoadingIndicator />);

      // Find the core div as the second child of wrapper (after svg)
      const wrapper = container.querySelector("div > div");
      const core = wrapper?.querySelector("div[aria-hidden='true']:not(.loading-container)");
      expect(core).toBeInTheDocument();
      expect(core).toHaveAttribute("aria-hidden", "true");
    });

    it("renders wrapper div", () => {
      const { container } = render(<LoadingIndicator />);

      const wrapper = container.querySelector("div > div");
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe("custom aria-label", () => {
    it("renders with custom aria-label", () => {
      const { container } = render(<LoadingIndicator ariaLabel="Processing your request" />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "Processing your request");
    });

    it("renders with custom aria-label for specific context", () => {
      const { container } = render(<LoadingIndicator ariaLabel="Uploading file..." />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "Uploading file...");
    });

    it("renders with empty string aria-label", () => {
      const { container } = render(<LoadingIndicator ariaLabel="" />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "");
    });
  });

  describe("custom className", () => {
    it("applies custom className", () => {
      const { container } = render(<LoadingIndicator className="my-custom-class" />);

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toHaveClass("my-custom-class");
    });

    it("applies base class and custom className", () => {
      const { container } = render(<LoadingIndicator className="custom-class another-class" />);

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toHaveClass("loading-container");
      expect(loadingContainer).toHaveClass("custom-class");
      expect(loadingContainer).toHaveClass("another-class");
    });
  });

  describe("accessibility", () => {
    it("has role='status' for screen readers", () => {
      const { container } = render(<LoadingIndicator />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toBeInTheDocument();
    });

    it("has aria-live='polite' for polite announcements", () => {
      const { container } = render(<LoadingIndicator />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-live", "polite");
    });

    it("hides decorative elements from screen readers", () => {
      const { container } = render(<LoadingIndicator />);

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");

      // Find the core div as the second child of wrapper
      const wrapper = container.querySelector("div > div");
      const core = wrapper?.querySelector("div[aria-hidden='true']");
      expect(core).toHaveAttribute("aria-hidden", "true");
    });

    it("provides accessible label via aria-label", () => {
      const { container } = render(<LoadingIndicator ariaLabel="Loading workflow" />);

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "Loading workflow");
    });
  });

  describe("combinations", () => {
    it("renders with custom aria-label and className", () => {
      const { container } = render(
        <LoadingIndicator ariaLabel="Generating content..." className="generation-loader" />
      );

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "Generating content...");

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toHaveClass("generation-loader");
    });

    it("renders with all props customized", () => {
      const { container } = render(
        <LoadingIndicator ariaLabel="Processing data..." className="data-processor active" />
      );

      const statusContainer = container.querySelector('[role="status"]');
      expect(statusContainer).toHaveAttribute("aria-label", "Processing data...");

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toHaveClass("data-processor");
      expect(loadingContainer).toHaveClass("active");
    });
  });

  describe("visual structure", () => {
    it("has correct container structure", () => {
      const { container } = render(<LoadingIndicator />);

      const loadingContainer = container.querySelector(".loading-container");
      expect(loadingContainer).toBeInTheDocument();
      expect(loadingContainer?.tagName.toLowerCase()).toBe("div");
    });

    it("has correct svg dimensions", () => {
      const { container } = render(<LoadingIndicator />);

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox", "0 0 28 28");
    });

    it("has correct circle element", () => {
      const { container } = render(<LoadingIndicator />);

      const circle = container.querySelector("circle");
      expect(circle).toBeInTheDocument();
      expect(circle).toHaveAttribute("cx", "14");
      expect(circle).toHaveAttribute("cy", "14");
      expect(circle).toHaveAttribute("r", "10");
    });

    it("has correct nested structure", () => {
      const { container } = render(<LoadingIndicator />);

      const loadingContainer = container.querySelector(".loading-container");
      const wrapper = loadingContainer?.querySelector("div");
      const svg = wrapper?.querySelector("svg");
      const core = wrapper?.querySelector("div[aria-hidden='true']");

      expect(wrapper).toBeInTheDocument();
      expect(svg).toBeInTheDocument();
      expect(core).toBeInTheDocument();
    });
  });
});
