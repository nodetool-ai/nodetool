import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, DataframeRef } from "../../../stores/ApiTypes";

// Heavy editor deps that are not exercised by the CSV branch.
jest.mock("../MonacoPane", () => ({
  __esModule: true,
  default: () => <div data-testid="monaco" />
}));
jest.mock("../../textEditor/EditorToolbar", () => ({
  __esModule: true,
  default: () => <div data-testid="editor-toolbar" />
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (s: { update: unknown }) => unknown) =>
    selector({ update: jest.fn() })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (s: { addNotification: unknown }) => unknown) =>
    selector({ addNotification: jest.fn() })
}));

// Stand-in for the real Tabulator-backed DataTable. It renders the row count it
// receives and an "add row" button that calls `onChange` exactly the way the
// real DataTable does: append one empty value per column.
jest.mock("../../node/DataTable/DataTable", () => ({
  __esModule: true,
  default: ({
    dataframe,
    onChange
  }: {
    dataframe: DataframeRef;
    onChange?: (df: DataframeRef) => void;
  }) => {
    const rows = (dataframe.data ?? []) as unknown[][];
    const addRow = () =>
      onChange?.({
        ...dataframe,
        data: [...rows, (dataframe.columns ?? []).map(() => "")]
      });
    return (
      <div>
        <div data-testid="row-count">{rows.length}</div>
        <button onClick={addRow}>add row</button>
      </div>
    );
  }
}));

import TextDocumentEditor from "../TextDocumentEditor";

const renderEditor = (asset: Asset) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <TextDocumentEditor asset={asset} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const csvAsset = (name: string): Asset =>
  ({
    id: "asset-1",
    name,
    content_type: "text/csv",
    get_url: `http://localhost/${name}`
  }) as unknown as Asset;

describe("TextDocumentEditor — CSV add row", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCsvText = (text: string) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => text
    }) as unknown as typeof fetch;
  };

  it("keeps the appended row for a single-column CSV", async () => {
    mockCsvText("name\nAda");
    renderEditor(csvAsset("rows.csv"));

    await waitFor(() =>
      expect(screen.getByTestId("row-count")).toHaveTextContent("1")
    );

    await userEvent.click(screen.getByRole("button", { name: "add row" }));

    expect(screen.getByTestId("row-count")).toHaveTextContent("2");
  });

  it("keeps the appended row for a multi-column CSV", async () => {
    mockCsvText("a,b\n1,2");
    renderEditor(csvAsset("rows.csv"));

    await waitFor(() =>
      expect(screen.getByTestId("row-count")).toHaveTextContent("1")
    );

    await userEvent.click(screen.getByRole("button", { name: "add row" }));

    expect(screen.getByTestId("row-count")).toHaveTextContent("2");
  });
});
