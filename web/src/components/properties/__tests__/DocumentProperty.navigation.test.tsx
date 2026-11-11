import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import {
  isTabInScope,
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import { stub } from "../../../test-utils/doubles";
import DocumentProperty from "../DocumentProperty";

const assetId = "0123456789abcdef0123456789abcdef";
let mockAsset: Asset | undefined;

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: mockAsset, uri: "https://example.com/report.pdf" })
}));
jest.mock("../PropertyDropzone", () => ({
  __esModule: true,
  default: () => null
}));

beforeEach(() => {
  useWorkspaceTabsStore.setState({
    tabs: [],
    activeTabId: null,
    activeProjectId: "current-project",
    projectSessions: {}
  });
  mockAsset = stub<Asset>({
    id: assetId,
    name: "report.pdf",
    content_type: "application/pdf",
    project_id: "current-project"
  });
});

const openDocument = async () => {
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <ThemeProvider theme={mockTheme}>
        <DocumentProperty
          property={{
            name: "value",
            required: false,
            type: { type: "document", optional: false, type_args: [] }
          }}
          value={{
            type: "document",
            uri: mockAsset
              ? `asset://${assetId}`
              : "https://example.com/report.pdf"
          }}
          nodeType="nodetool.input.DocumentInput"
          nodeId="input"
          propertyIndex="0"
          onChange={jest.fn()}
        />
      </ThemeProvider>
    </MemoryRouter>
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Open document in new tab" })
  );
  const state = useWorkspaceTabsStore.getState();
  const opened = state.tabs.find((tab) => tab.id === state.activeTabId);
  expect(opened?.type).toBe("document");
  expect(opened && isTabInScope(opened, state.activeProjectId)).toBe(true);
  return state;
};

it("keeps the opened document visible in its active project", async () => {
  const state = await openDocument();
  expect(state.activeProjectId).toBe("current-project");
});

it("switches scope when the document belongs to another project", async () => {
  mockAsset = stub<Asset>({ ...mockAsset, project_id: "document-project" });
  const state = await openDocument();
  expect(state.activeProjectId).toBe("document-project");
});

it("switches to the loose scope for an unassigned document", async () => {
  mockAsset = stub<Asset>({ ...mockAsset, project_id: LOOSE_PROJECT_ID });
  const state = await openDocument();
  expect(state.activeProjectId).toBeNull();
});

it("keeps external documents in the active project scope", async () => {
  mockAsset = undefined;
  const state = await openDocument();
  expect(state.activeProjectId).toBe("current-project");
});
