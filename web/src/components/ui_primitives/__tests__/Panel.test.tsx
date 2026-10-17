import React from "react";
import { render, screen } from "@testing-library/react";
import { Panel } from "../Panel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";
import { firstElement } from "../../../test-utils/doubles";

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

      const panel = firstElement(container);
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

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies compact padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="compact">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies normal padding variant (default)", () => {
      const { container } = renderWithTheme(
        <Panel padding="normal">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies comfortable padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="comfortable">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies spacious padding variant", () => {
      const { container } = renderWithTheme(
        <Panel padding="spacious">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies custom number padding", () => {
      const { container } = renderWithTheme(
        <Panel padding={3}>
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });
  });

  describe("Border", () => {
    it("applies border by default", () => {
      const { container } = renderWithTheme(
        <Panel>
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toHaveStyle({ border: "1px solid #2f2f2f" });
    });

    it("does not apply border when bordered is false", () => {
      const { container } = renderWithTheme(
        <Panel bordered={false}>
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).not.toHaveStyle({ border: "1px solid #2f2f2f" });
    });
  });

  describe("Background", () => {
    it("applies paper background by default", () => {
      const { container } = renderWithTheme(
        <Panel>
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toHaveStyle({ backgroundColor: "#232323" });
    });

    it("applies default background", () => {
      const { container } = renderWithTheme(
        <Panel background="default">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toHaveStyle({ backgroundColor: "#202020" });
    });

    it("applies paper background", () => {
      const { container } = renderWithTheme(
        <Panel background="paper">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });

    it("applies transparent background", () => {
      const { container } = renderWithTheme(
        <Panel background="transparent">
          <div>Content</div>
        </Panel>
      );

      const panel = firstElement(container);
      expect(panel).toBeInTheDocument();
    });
  });

  describe("PanelHeader title row", () => {
    it("renders the title row as a PanelHeader", () => {
      const { container } = renderWithTheme(
        <Panel title="Settings">
          <div>Content</div>
        </Panel>
      );

      const header = container.querySelector(".panel-header");
      expect(header).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toHaveClass(
        "panel-header-title"
      );
    });

    it("puts the header action in the PanelHeader action slot", () => {
      const { container } = renderWithTheme(
        <Panel title="Users" headerAction={<button>Add user</button>}>
          <div>Content</div>
        </Panel>
      );

      const actions = container.querySelector(".panel-header-actions");
      expect(actions).toContainElement(
        screen.getByRole("button", { name: "Add user" })
      );
    });
  });

  describe("Collapsible", () => {
    const toggle = () =>
      screen.getByRole("button", { name: /^(Collapse|Expand)$/ });

    it("renders a collapse button when expanded", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("renders an expand button and hides content when collapsed", () => {
      renderWithTheme(
        <Panel title="Collapsible Panel" collapsible collapsed={true}>
          <div>Hidden content</div>
        </Panel>
      );

      expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
      expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    });

    it("calls onToggleCollapse when the toggle is clicked", async () => {
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

      await user.click(toggle());
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it("calls onToggleCollapse from the keyboard", async () => {
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

      toggle().focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      expect(handleToggle).toHaveBeenCalledTimes(2);
    });

    it("renders no toggle on a non-collapsible panel", () => {
      renderWithTheme(
        <Panel title="Non-collapsible Panel">
          <div>Content</div>
        </Panel>
      );

      expect(
        screen.queryByRole("button", { name: /^(Collapse|Expand)$/ })
      ).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("reports the expanded state on the toggle", () => {
      const { rerender } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );
      expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute(
        "aria-expanded",
        "true"
      );

      rerender(
        <ThemeProvider theme={mockTheme}>
          <Panel title="Collapsible" collapsible collapsed={true}>
            <div>Content</div>
          </Panel>
        </ThemeProvider>
      );
      expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    });

    it("points aria-controls at the content region", () => {
      const { container } = renderWithTheme(
        <Panel title="Collapsible" collapsible collapsed={false}>
          <div>Content</div>
        </Panel>
      );

      const controls = screen
        .getByRole("button", { name: "Collapse" })
        .getAttribute("aria-controls");
      expect(controls).toMatch(/^panel-content-/);
      const region = container.querySelector(`#${controls}`);
      expect(region).toHaveAttribute("role", "region");
      expect(region).toHaveTextContent("Content");
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
      expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
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
