import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useStaleDeployStore } from "../../../stores/StaleDeployStore";
import { reloadIntoNewDeploy } from "../../../lib/staleDeployPrompt";
import StaleDeployDialog from "../StaleDeployDialog";

jest.mock("../../../lib/staleDeployPrompt", () => ({
  reloadIntoNewDeploy: jest.fn()
}));

function renderDialog(): void {
  render(
    <ThemeProvider theme={mockTheme}>
      <StaleDeployDialog />
    </ThemeProvider>
  );
}

describe("StaleDeployDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStaleDeployStore.setState({
      open: true,
      reason: "update",
      dismissed: false
    });
  });

  it("reloads only when the user chooses Reload now", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Reload now" }));

    expect(reloadIntoNewDeploy).toHaveBeenCalledTimes(1);
  });

  it("closes without reloading on Later and remembers the choice", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Later" }));

    expect(reloadIntoNewDeploy).not.toHaveBeenCalled();
    expect(useStaleDeployStore.getState()).toMatchObject({
      open: false,
      dismissed: true
    });
  });

  it("explains a failed load when a chunk could not load", () => {
    useStaleDeployStore.setState({ reason: "chunk-error" });
    renderDialog();

    expect(
      screen.getByText(/could not load because NodeTool was updated/)
    ).toBeTruthy();
  });
});
