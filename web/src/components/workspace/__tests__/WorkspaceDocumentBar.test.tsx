import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";
import WorkspaceDocumentBar from "../WorkspaceDocumentBar";

let phone = false;

jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: () => phone
}));

jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => jest.fn()
}));

const tab: WorkspaceTab = {
  id: "text:a",
  type: "text",
  ref: "a",
  mode: "edit",
  title: "Konzept B"
};

const renderBar = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkspaceDocumentBar tab={tab} status={<span>status</span>} />
    </ThemeProvider>
  );

describe("WorkspaceDocumentBar", () => {
  afterEach(() => {
    phone = false;
  });

  it("leaves the name to the tab on desktop", () => {
    renderBar();

    expect(
      screen.getByRole("toolbar", { name: "Konzept B document" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Konzept B")).toBeNull();
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("keeps the name on phones, which show no tabs", () => {
    phone = true;
    renderBar();

    expect(screen.getByText("Konzept B")).toBeInTheDocument();
  });
});
