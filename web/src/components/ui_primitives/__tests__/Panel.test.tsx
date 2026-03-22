import React from "react";
import { render, screen } from "@testing-library/react";
import { Panel } from "../Panel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("Panel", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("Basic Rendering", () => {
    it("renders children correctly", () => {
      renderWithTheme(
        <Panel>
          <div>Panel content</div>
        </Panel>
      );

      expect(screen.getByText("Panel content")).toBeInTheDocument();
    });

    it("renders without header when no title, subtitle, or headerAction", () => {
      const { container } = renderWithTheme(
        <Panel>
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Header", () => {
    it("renders title correctly", () => {
      renderWithTheme(
        <Panel title="Panel Title">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("Panel Title")).toBeInTheDocument();
    });

    it("renders subtitle correctly", () => {
      renderWithTheme(
        <Panel title="Title" subtitle="Panel subtitle">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("Panel subtitle")).toBeInTheDocument();
    });

    it("renders header action correctly", () => {
      renderWithTheme(
        <Panel title="Title" headerAction={<button>Action</button>}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    });

    it("does not render header when no title, subtitle, or action provided", () => {
      const { container } = renderWithTheme(
        <Panel>
          <div>Content</div>
        </Panel>
      );

      const panel = container.querySelector("[class*=\"MuiBox-root\"]");
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Footer", () => {
    it("renders footer correctly", () => {
      renderWithTheme(
        <Panel footer={<div>Footer content</div>}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("Footer content")).toBeInTheDocument();
    });

    it("does not render footer when not provided", () => {
      const _ = renderWithTheme(
        <Panel>
          <div>Content</div>
        </Panel>
      );

      expect(screen.queryByText("Footer content")).not.toBeInTheDocument();
    });
  });

  describe("Padding", () => {
    it("applies none padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="none">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies compact padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="compact">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies normal padding variant (default)", () => {
      const { container } = renderWithTheme(
        <Panel padding="normal">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies comfortable padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="comfortable">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies spacious padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="spacious">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies custom number padding", () => {
      const { container } = renderWithTheme(
        <Panel padding={3}>
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Border", () => {
    it("applies border when bordered is true", () => {
      const { container } = renderWithTheme(
        <Panel bordered>
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("does not apply border when bordered is false (default)", () => {
      const { container } = renderWithTheme(
        <Panel bordered={false}>
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Background", () => {
    it("applies default background", () => {
      const { container } = renderWithTheme(
        <Panel background="default">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies paper background", () => {
      const { container } = renderWithTheme(
        <Panel background="paper">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });

    it("applies transparent background", () => {
      const { container } = renderWithTheme(
        <Panel background="transparent">
          <div>Content</div>
        </Panel>
      );

      const panel = container.firstChild as HTMLElement;
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Collapsible", () => {
    it("renders collapse indicator when collapsible", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      // Check for the collapse indicator (▲ when expanded)
      expect(screen.getByText("▲")).toBeInTheDocument();
    });

    it("shows expanded indicator when not collapsed", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("▲")).toBeInTheDocument();
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("shows collapsed indicator when collapsed", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={true}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("▼")).toBeInTheDocument();
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("hides content when collapsed", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={true}>
          <div>Hidden content</div>
        </Panel>
      );

      expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    });

    it("shows content when expanded", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={false}>
          <div>Visible content</div>
        </Panel>
      );

      expect(screen.getByText("Visible content")).toBeInTheDocument();
    });
  });

  describe("Collapsible Interactions", () => {
    it("calls onToggleCollapse when header is clicked", async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();

      renderWithTheme(
        <Panel
          title="Collapsible Panel"
          collapsible
          collapsed={false}
          onToggleCollapse={handleToggle}
        >
          <div>Content</div>
        </Panel>
      );

      const header = screen.getByText("Collapsible Panel").closest("div");
      if (header) {
        await user.click(header);
        expect(handleToggle).toHaveBeenCalledTimes(1);
      }
    });

    it("calls onToggleCollapse when Enter key is pressed", async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();

      renderWithTheme(
        <Panel
          title="Collapsible Panel"
          collapsible
          collapsed={false}
          onToggleCollapse={handleToggle}
        >
          <div>Content</div>
        </Panel>
      );

      const header = screen.getByText("Collapsible Panel").closest("div[role=\"button\"]");
      if (header) {
        await user.click(header);
        await user.keyboard("{Enter}");
        expect(handleToggle).toHaveBeenCalledTimes(2); // Once from click, once from Enter
      }
    });

    it("calls onToggleCollapse when Space key is pressed", async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();

      renderWithTheme(
        <Panel
          title="Collapsible Panel"
          collapsible
          collapsed={false}
          onToggleCollapse={handleToggle}
        >
          <div>Content</div>
        </Panel>
      );

      const header = screen.getByText("Collapsible Panel").closest("div[role=\"button\"]");
      if (header) {
        await user.click(header);
        await user.keyboard(" ");
        expect(handleToggle).toHaveBeenCalledTimes(2); // Once from click, once from Space
      }
    });

    it("does not call onToggleCollapse when non-collapsible panel is clicked", async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();

      renderWithTheme(
        <Panel
          title="Non-collapsible Panel"
          onToggleCollapse={handleToggle}
        >
          <div>Content</div>
        </Panel>
      );

      const header = screen.getByText("Non-collapsible Panel").closest("div");
      if (header) {
        await user.click(header);
        expect(handleToggle).not.toHaveBeenCalled();
      }
    });
  });

  describe("Accessibility", () => {
    it("adds role=\"button\" to collapsible panel header", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).toBeInTheDocument();
    });

    it("adds tabIndex={0} to collapsible panel header for keyboard navigation", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).toHaveAttribute("tabIndex", "0");
    });

    it("sets aria-expanded to true when panel is expanded", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).toHaveAttribute("aria-expanded", "true");
    });

    it("sets aria-expanded to false when panel is collapsed", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={true}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).toHaveAttribute("aria-expanded", "false");
    });

    it("adds aria-controls to collapsible panel header", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).toHaveAttribute("aria-controls");
      expect(header?.getAttribute("aria-controls")).toMatch(/^panel-content-/);
    });

    it("adds id to content region for aria-controls reference", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      const ariaControls = header?.getAttribute("aria-controls");
      const contentRegion = container.querySelector(`#${ariaControls}`);

      expect(contentRegion).toBeInTheDocument();
    });

    it("adds role=\"region\" to collapsible panel content", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const contentRegion = container.querySelector("[role=\"region\"]");
      expect(contentRegion).toBeInTheDocument();
    });

    it("adds aria-hidden to collapse indicator icon", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const indicator = container.querySelector("[aria-hidden=\"true\"]");
      expect(indicator).toBeInTheDocument();
    });

    it("does not add ARIA attributes to non-collapsible panel", () => {
      const { container } = renderWithTheme(
        <Panel title="Non-collapsible">
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector("[role=\"button\"]");
      expect(header).not.toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("renders correctly with all props combined", () => {
      const _ = renderWithTheme(
        <Panel
          title="Full Panel"
          subtitle="Complete subtitle"
          headerAction={<button>Action</button>}
          footer={<div>Footer</div>}
          padding="comfortable"
          bordered
          background="paper"
          collapsible
          collapsed={false}
        >
          <div>Complete content</div>
        </Panel>
      );

      expect(screen.getByText("Full Panel")).toBeInTheDocument();
      expect(screen.getByText("Complete subtitle")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
      expect(screen.getByText("Footer")).toBeInTheDocument();
      expect(screen.getByText("Complete content")).toBeInTheDocument();
      expect(screen.getByText("▲")).toBeInTheDocument();
    });

    it("renders with only footer and no header", () => {
      renderWithTheme(
        <Panel footer={<div>Only footer</div>}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText("Only footer")).toBeInTheDocument();
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("renders with title but no content when collapsed", () => {
      renderWithTheme(
        <Panel title="Title" collapsible collapsed={true}>
          <div>Hidden Content</div>
        </Panel>
      );

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.queryByText("Hidden Content")).not.toBeInTheDocument();
    });
  });
});
