import { render, screen } from "@testing-library/react";
import { runControlTooltip } from "../runControlTooltip";

const idle = {
  isStopping: false,
  isWorkflowActive: false,
  runControlLabel: "Run entire workflow",
  pendingRunCount: 0
};

describe("runControlTooltip", () => {
  it("shows the run shortcut, not an object string, when idle", () => {
    const { container } = render(<>{runControlTooltip(idle)}</>);

    expect(container.textContent).not.toContain("[object Object]");
    expect(screen.getByText("Run Workflow")).toBeInTheDocument();
    expect(screen.getByText("Execute the current workflow")).toBeInTheDocument();
  });

  it("explains a queued run", () => {
    expect(runControlTooltip({ ...idle, queuePosition: 2 })).toBe("Queued (#2)");
  });
});
