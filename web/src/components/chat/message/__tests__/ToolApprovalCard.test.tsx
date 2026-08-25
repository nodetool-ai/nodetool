import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import ToolApprovalCard from "../ToolApprovalCard";
import mockTheme from "../../../../__mocks__/themeMock";

const onResolve = jest.fn();

const CODE = "await deleteWorkflows(ids);\nreturn ids.length;";

interface CardProps {
  toolName?: string;
  category?: string;
  message?: string;
  description?: string;
  args?: Record<string, unknown>;
}

const renderCard = (overrides: CardProps = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ToolApprovalCard
        approvalId="appr_1"
        toolName={overrides.toolName ?? "execute_code"}
        category={overrides.category ?? "execute"}
        message={overrides.message ?? "Deleting the old workflows"}
        description={
          "description" in overrides
            ? overrides.description
            : "Deletes the 3 archived workflows listed above. They cannot be restored."
        }
        args={
          overrides.args ?? { title: "Deleting the old workflows", risk: "high", code: CODE }
        }
        onResolve={onResolve}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  onResolve.mockReset();
});

describe("ToolApprovalCard", () => {
  it("asks about the description, not the code", () => {
    renderCard();
    expect(screen.getByText("Run this action?")).toBeInTheDocument();
    expect(
      screen.getByText(/Deletes the 3 archived workflows/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/deleteWorkflows/)).not.toBeInTheDocument();
  });

  it("unfolds the code for whoever wants to read it", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByText("Show code"));
    expect(screen.getByText(/deleteWorkflows/)).toBeInTheDocument();
  });

  it("falls back to the status message when no description was written", () => {
    renderCard({ description: "" });
    expect(screen.getByText("Deleting the old workflows")).toBeInTheDocument();
  });

  it("marks a high-risk call", () => {
    renderCard();
    expect(screen.getByText("high risk")).toBeInTheDocument();
  });

  it("asks a write call about the change it makes", () => {
    renderCard({
      toolName: "delete_workflow",
      category: "write",
      message: "Deleting workflow wf_1",
      description: "",
      args: { workflow_id: "wf_1" }
    });
    expect(screen.getByText("Make this change?")).toBeInTheDocument();
    expect(screen.getByText("Deleting workflow wf_1")).toBeInTheDocument();
    // No code to fold, so only the arguments are offered.
    expect(screen.queryByText("Show code")).not.toBeInTheDocument();
    expect(screen.getByText("Show arguments")).toBeInTheDocument();
  });

  it("offers no folds for a call with no arguments", () => {
    renderCard({
      toolName: "publish",
      category: "external",
      description: "",
      args: {}
    });
    expect(screen.getByText("Allow this action?")).toBeInTheDocument();
    expect(screen.queryByText("Show code")).not.toBeInTheDocument();
    expect(screen.queryByText("Show arguments")).not.toBeInTheDocument();
  });

  it("reports each decision under the approval id", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(onResolve).toHaveBeenCalledWith("appr_1", "allow");
    await user.click(
      screen.getByRole("button", { name: "Allow for this chat" })
    );
    expect(onResolve).toHaveBeenCalledWith("appr_1", "allow_for_chat");
    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(onResolve).toHaveBeenCalledWith("appr_1", "deny");
  });
});
