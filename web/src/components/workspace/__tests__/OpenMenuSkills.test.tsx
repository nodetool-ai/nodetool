/**
 * The `[+]` menu's New skill item creates a skill document and opens it
 * as a workspace tab.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockOpenMenu, renderOpenMenu } from "../openMenuTestHarness";

describe("OpenMenu skills", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenMenu.createSkill.mockResolvedValue({
      id: "skill-1",
      name: "skill-abc"
    });
  });

  it("creates a skill and opens it as a tab", async () => {
    const user = userEvent.setup();
    renderOpenMenu();
    await user.click(screen.getByText("New skill"));

    await waitFor(() =>
      expect(mockOpenMenu.createSkill).toHaveBeenCalledWith({
        id: "minted-skill-id",
        name: expect.stringMatching(/^skill-[a-z0-9]+$/),
        description: "A reusable skill for the NodeTool agent.",
        content:
          "# New skill\n\nDescribe what this skill does and when the agent should use it."
      })
    );
    expect(mockOpenMenu.openTab).toHaveBeenCalledWith({
      type: "skill",
      ref: "skill-1",
      mode: "edit",
      title: "skill-abc"
    });
  });

  it("reports a failed create instead of dying quietly", async () => {
    mockOpenMenu.createSkill.mockRejectedValueOnce(new Error("store down"));
    const user = userEvent.setup();
    renderOpenMenu();
    await user.click(screen.getByText("New skill"));

    await waitFor(() => expect(mockOpenMenu.addNotification).toHaveBeenCalled());
    expect(mockOpenMenu.addNotification.mock.calls[0][0].content).toContain(
      "store down"
    );
    expect(mockOpenMenu.openTab).not.toHaveBeenCalled();
  });
});
