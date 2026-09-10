import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import EntityLibrary from "../EntityLibrary";

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [], isLoading: false }),
  useDeleteEntity: () => ({ mutate: jest.fn() })
}));

jest.mock("../../setup/entity/EntitySetupHost", () => ({
  __esModule: true,
  default: () => <div data-testid="entity-setup">Guided entity setup</div>
}));

describe("EntityLibrary", () => {
  it("opens the guided flow from its primary create action", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <EntityLibrary />
      </ThemeProvider>
    );

    await user.click(
      screen.getAllByRole("button", { name: "Add entity" })[0]
    );

    expect(screen.getByTestId("entity-setup")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to entities" })
    ).toBeInTheDocument();
  });
});
