import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import PlanApprovalCard from "../PlanApprovalCard";
import mockTheme from "../../../../__mocks__/themeMock";
import type { PendingPlanApproval } from "../../../../stores/GlobalChatStore";

const onResolve = jest.fn();

const approval: PendingPlanApproval = {
  thread_id: "t1",
  plan: {
    title: "Add caching",
    tasks: [
      {
        id: "inspect",
        title: "Inspect the cache layer",
        depends_on: [],
        steps: [{ id: "s1", instructions: "Read the current cache config" }]
      }
    ]
  }
};

const renderCard = (next: PendingPlanApproval = approval) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PlanApprovalCard
        approvalId="appr_1"
        approval={next}
        onResolve={onResolve}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  onResolve.mockReset();
});

describe("PlanApprovalCard", () => {
  it("asks whether to run the plan and shows its tasks", () => {
    renderCard();
    expect(
      screen.getByRole("group", { name: "Run this plan?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add caching" })
    ).toBeInTheDocument();
    expect(screen.getByText("Inspect the cache layer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revise" })
    ).toBeDisabled();
  });

  it("runs the plan without sending feedback", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Run this plan" }));
    expect(onResolve).toHaveBeenCalledWith("appr_1", "approve");
  });

  it("revises only after a note is written", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.getByRole("button", { name: "Revise" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("What should change?"),
      "Skip Redis"
    );
    expect(screen.getByRole("button", { name: "Revise" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Revise" }));
    expect(onResolve).toHaveBeenCalledWith("appr_1", "reject", "Skip Redis");
  });

  it("aborts without sending a typed note", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(
      screen.getByLabelText("What should change?"),
      "Skip Redis"
    );
    await user.click(screen.getByRole("button", { name: "Don't run" }));
    expect(onResolve).toHaveBeenCalledWith("appr_1", "reject");
  });
});
