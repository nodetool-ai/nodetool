import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockUseQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: { documents: { index: { useQuery: (...args: unknown[]) => mockUseQuery(...args) } } }
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(
    selector: (state: { activeProjectId: string; personalProjectId: string }) => T
  ) => selector({ activeProjectId: "p1", personalProjectId: "personal" }),
  LOOSE_PROJECT_ID: "default"
}));

import ProjectDocumentSelect from "../ProjectDocumentSelect";

const documents = [
  { id: "md1", type: "text", name: "brief.md", updatedAt: "" },
  { id: "json1", type: "text", name: "data.json", updatedAt: "" },
  { id: "wf1", type: "workflow", name: "flow.md", updatedAt: "" }
];

describe("ProjectDocumentSelect", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { documents, partial: false }, isLoading: false, error: null });
  });

  it("lists the project's Markdown documents and writes the picked one by asset id", () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ProjectDocumentSelect id="pick" assetId="" onChange={onChange} allowNone />
      </ThemeProvider>
    );
    expect(mockUseQuery).toHaveBeenCalledWith({ projectId: "p1" }, expect.anything());
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const list = within(screen.getByRole("listbox"));
    expect(list.queryByText("data.json")).toBeNull();
    expect(list.queryByText("flow.md")).toBeNull();
    fireEvent.click(list.getByText("brief.md"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "document", uri: "asset://md1", asset_id: "md1" })
    );
  });
});
