/**
 * The destination picker every guided flow starts through: one row per
 * destination, picking a row confirms at once, cancel only closes.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import GuidedFlowProjectDialog from "../GuidedFlowProjectDialog";

const renderDialog = (options?: {
  busy?: boolean;
  onPick?: jest.Mock;
  onClose?: jest.Mock;
}) => {
  const onPick = options?.onPick ?? jest.fn();
  const onClose = options?.onClose ?? jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <GuidedFlowProjectDialog
        open
        flowTitle="Storyboard"
        currentProjectName="Aurora launch"
        busy={options?.busy}
        onPick={onPick}
        onClose={onClose}
      />
    </ThemeProvider>
  );
  return { onPick, onClose };
};

describe("GuidedFlowProjectDialog", () => {
  it("names the flow and the current project", () => {
    renderDialog();
    expect(screen.getByText("Start Storyboard in…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Start in current project, Aurora launch"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start in a new project" })
    ).toBeInTheDocument();
  });

  it("picks the current project in one click", async () => {
    const user = userEvent.setup();
    const { onPick, onClose } = renderDialog();
    await user.click(
      screen.getByRole("button", {
        name: "Start in current project, Aurora launch"
      })
    );
    expect(onPick).toHaveBeenCalledWith("current");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("picks a new project in one click", async () => {
    const user = userEvent.setup();
    const { onPick } = renderDialog();
    await user.click(
      screen.getByRole("button", { name: "Start in a new project" })
    );
    expect(onPick).toHaveBeenCalledWith("new");
  });

  it("goes quiet while a pick is in flight", async () => {
    const user = userEvent.setup();
    const { onPick } = renderDialog({ busy: true });
    const current = screen.getByRole("button", {
      name: "Start in current project, Aurora launch"
    });
    expect(current).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Start in a new project" })
    ).toBeDisabled();
    await user.click(current);
    expect(onPick).not.toHaveBeenCalled();
  });
});
