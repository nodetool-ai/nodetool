import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";
import { useAssetStore } from "../../../stores/AssetStore";
import type { Asset } from "../../../stores/ApiTypes";
import DocumentEditor from "../DocumentEditor";

jest.mock("../../../trpc/client", () => ({
  trpcClient: { assets: { update: { mutate: jest.fn() } } }
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: jest.fn() }
}));
jest.mock("../../../queryClient", () => ({
  queryClient: { setQueryData: jest.fn() }
}));
jest.mock("../../workspace/MonacoPane", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea aria-label="markdown source" value={value} onChange={(e) => onChange(e.target.value)} />
  )
}));
jest.mock("../../textEditor/CodeHighlightPlugin", () => ({
  CodeHighlightPlugin: () => null
}));
jest.mock("../DocumentAgentPanel", () => ({
  __esModule: true,
  default: () => <div>assistant panel</div>
}));
jest.mock("../DocumentVersionsPanel", () => ({
  __esModule: true,
  default: () => <div>versions panel</div>
}));

const SOURCE = "# Launch notes\n\n- [ ] write the plan\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";

const asset = {
  id: "doc-1",
  name: "notes.md",
  content_type: "text/markdown",
  project_id: "p1",
  workspace_path: "notes.md",
  updated_at: "2026-01-01T00:00:00.000Z",
  metadata: {},
  get_url: "http://test/doc-1"
} as unknown as Asset;

beforeEach(() => {
  (useAssetStore.getState as jest.Mock).mockReturnValue({
    get: jest.fn(async () => asset),
    add: jest.fn()
  });
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => SOURCE
  })) as unknown as typeof fetch;
  (trpcClient.assets.update.mutate as jest.Mock).mockResolvedValue(asset);
});

const renderEditor = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DocumentEditor asset={asset} />
    </ThemeProvider>
  );

describe("DocumentEditor", () => {
  it("shows the file formatted: heading, task and table", async () => {
    renderEditor();
    expect(await screen.findByRole("heading", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.getByText("write the plan")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows the same file as Markdown in the Markdown view", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });
    await userEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() =>
      expect(screen.getByLabelText("markdown source")).toHaveValue(SOURCE)
    );
  });
});
