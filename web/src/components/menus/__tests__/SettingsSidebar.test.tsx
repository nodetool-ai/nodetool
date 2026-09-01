import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsSidebar from "../SettingsSidebar";

const sections = [
  {
    category: "Workspace",
    items: [
      { id: "editor", label: "Editor" },
      { id: "appearance", label: "Appearance" }
    ]
  },
  {
    category: "Workflow",
    items: [{ id: "execution", label: "Execution" }]
  }
];

describe("SettingsSidebar", () => {
  it("lists sections as buttons, not collapsible folders", () => {
    render(
      <SettingsSidebar
        activeSection="editor"
        sections={sections}
        onSectionClick={jest.fn()}
      />
    );

    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editor" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.queryByRole("button", { name: /workspace/i })).not.toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("calls onSectionClick with the section id", async () => {
    const user = userEvent.setup();
    const onSectionClick = jest.fn();
    render(
      <SettingsSidebar
        activeSection="editor"
        sections={sections}
        onSectionClick={onSectionClick}
      />
    );

    await user.click(screen.getByRole("button", { name: "Appearance" }));
    expect(onSectionClick).toHaveBeenCalledWith("appearance");
  });
});
