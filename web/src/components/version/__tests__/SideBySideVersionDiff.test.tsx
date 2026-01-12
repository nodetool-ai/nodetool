import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SideBySideVersionDiff } from "../SideBySideVersionDiff";

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {component}
    </ThemeProvider>
  );
};

const mockVersions = [
  {
    id: "v3",
    workflow_id: "wf-1",
    version: 3,
    created_at: "2024-01-15T10:30:00Z",
    name: "Version 3",
    save_type: "manual" as const,
    size_bytes: 1024,
    graph: {
      nodes: [
        { id: "node-1", type: "nodetool.input.StringInput", sync_mode: "static" },
        { id: "node-2", type: "nodetool.process.LLM", sync_mode: "static" },
        { id: "node-3", type: "nodetool.output.TextOutput", sync_mode: "static" }
      ],
      edges: [
        { id: "e1", source: "node-1", target: "node-2" },
        { id: "e2", source: "node-2", target: "node-3" }
      ]
    }
  },
  {
    id: "v2",
    workflow_id: "wf-1",
    version: 2,
    created_at: "2024-01-14T10:30:00Z",
    name: "Version 2",
    save_type: "autosave" as const,
    size_bytes: 900,
    graph: {
      nodes: [
        { id: "node-1", type: "nodetool.input.StringInput", sync_mode: "static" },
        { id: "node-2", type: "nodetool.process.LLM", sync_mode: "static" }
      ],
      edges: [
        { id: "e1", source: "node-1", target: "node-2" }
      ]
    }
  },
  {
    id: "v1",
    workflow_id: "wf-1",
    version: 1,
    created_at: "2024-01-13T10:30:00Z",
    name: "Version 1",
    save_type: "manual" as const,
    size_bytes: 500,
    graph: {
      nodes: [
        { id: "node-1", type: "nodetool.input.StringInput", sync_mode: "static" }
      ],
      edges: []
    }
  }
] as Array<{
  id: string;
  workflow_id: string;
  version: number;
  created_at: string;
  name: string;
  save_type: string;
  size_bytes: number;
  graph: {
    nodes: Array<{ id: string; type: string; sync_mode: string }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
}>;

describe("SideBySideVersionDiff", () => {
  it("renders without crashing", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("Version Comparison")).toBeInTheDocument();
  });

  it("shows change summary when versions differ", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("Change Summary")).toBeInTheDocument();
  });

  it("has a swap button to exchange versions", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByTestId("SwapHorizIcon")).toBeInTheDocument();
  });

  it("shows legend chips for change types", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
  });

  it("displays mini graphs with nodes", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Version 3")).toBeInTheDocument();
  });

  it("calls onRestore when restore button is clicked", async () => {
    const user = userEvent.setup();
    const onRestore = jest.fn();

    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
        onRestore={onRestore}
      />
    );

    const restoreButtons = screen.getAllByRole("button", { name: /Restore This Version/i });
    await user.click(restoreButtons[0]);

    expect(onRestore).toHaveBeenCalled();
  });

  it("displays time arrow indicator", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("Time →")).toBeInTheDocument();
  });

  it("handles empty versions list gracefully", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={[] as any}
      />
    );

    expect(screen.getByText("Version Comparison")).toBeInTheDocument();
  });

  it("handles single version gracefully", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={[mockVersions[0]] as any}
      />
    );

    expect(screen.getByText("Version Comparison")).toBeInTheDocument();
  });

  it("shows change statistics", () => {
    renderWithTheme(
      <SideBySideVersionDiff
        versions={mockVersions as any}
      />
    );

    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
