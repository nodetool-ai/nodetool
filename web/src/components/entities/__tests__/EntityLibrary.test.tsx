import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import EntityLibrary from "../EntityLibrary";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useEntityLibraryStore } from "../../../stores/EntityLibraryStore";
import {
  readEntitySetupDraft,
  writeEntitySetupDraft
} from "../../setup/entity/entitySetupDraft";

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [], isLoading: false }),
  useDeleteEntity: () => ({ mutate: jest.fn() })
}));

jest.mock("../../setup/entity/EntitySetupHost", () => ({
  __esModule: true,
  default: ({ draftKey }: { draftKey?: string }) => (
    <div data-testid="entity-setup" data-draft-key={draftKey}>
      Guided entity setup
    </div>
  )
}));

const renderLibrary = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <EntityLibrary />
    </ThemeProvider>
  );

const draft = {
  version: 1 as const,
  stage: "details" as const,
  details: {
    kind: "character" as const,
    name: "Nova",
    descriptor: "",
    tags: ""
  },
  assetId: null
};

describe("EntityLibrary", () => {
  beforeEach(() => {
    useEntityLibraryStore.setState({ creating: false });
  });

  it("opens the guided flow from its primary create action", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <EntityLibrary />
      </ThemeProvider>
    );

    await user.click(screen.getAllByRole("button", { name: "Add entity" })[0]);

    expect(screen.getByTestId("entity-setup")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to entities" })
    ).toBeInTheDocument();
  });

  it("keeps a separate draft per project", async () => {
    const user = userEvent.setup();
    useWorkspaceTabsStore.setState({ activeProjectId: "project-a" });
    const first = renderLibrary();
    await user.click(screen.getAllByRole("button", { name: "Add entity" })[0]);
    const keyA = screen
      .getByTestId("entity-setup")
      .getAttribute("data-draft-key");
    first.unmount();
    useEntityLibraryStore.setState({ creating: false });

    useWorkspaceTabsStore.setState({ activeProjectId: "project-b" });
    renderLibrary();
    await user.click(screen.getAllByRole("button", { name: "Add entity" })[0]);
    const keyB = screen
      .getByTestId("entity-setup")
      .getAttribute("data-draft-key");

    expect(keyA).toContain("project-a");
    expect(keyB).toContain("project-b");
  });

  it("discards the draft when the creator goes back to the entities", async () => {
    const user = userEvent.setup();
    useWorkspaceTabsStore.setState({ activeProjectId: "project-a" });
    renderLibrary();
    await user.click(screen.getAllByRole("button", { name: "Add entity" })[0]);
    const key =
      screen.getByTestId("entity-setup").getAttribute("data-draft-key") ??
      undefined;
    writeEntitySetupDraft(key, draft);

    await user.click(screen.getByRole("button", { name: "Back to entities" }));

    expect(readEntitySetupDraft(key)).toBeNull();
  });
});
