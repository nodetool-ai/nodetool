import { act, renderHook } from "@testing-library/react";

const exportMutate = jest.fn();
const exportGoogleMutate = jest.fn();
const importMutate = jest.fn();
const importGoogleMutate = jest.fn();
const openForegroundTab = jest.fn();
const addNotification = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    textDocuments: {
      export: { mutate: (input: unknown) => exportMutate(input) },
      exportGoogleDoc: { mutate: (input: unknown) => exportGoogleMutate(input) },
      import: { mutate: (input: unknown) => importMutate(input) },
      importGoogleDoc: { mutate: (input: unknown) => importGoogleMutate(input) }
    }
  }
}));
jest.mock("../../queryClient", () => ({
  queryClient: { invalidateQueries: jest.fn() }
}));
jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: (select: (state: unknown) => unknown) => select({ addNotification })
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "loose",
  useWorkspaceTabsStore: (select: (state: unknown) => unknown) => select({ openForegroundTab })
}));

import {
  isImportableAsDocument,
  useTextDocumentExport,
  useTextDocumentImport
} from "../useTextDocumentTransfer";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isImportableAsDocument", () => {
  it("accepts the formats an import reads and leaves Markdown to open as it is", () => {
    expect(isImportableAsDocument("Brief.DOCX")).toBe(true);
    expect(isImportableAsDocument("scan.pdf")).toBe(true);
    expect(isImportableAsDocument("notes.md")).toBe(false);
    expect(isImportableAsDocument("clip.mp4")).toBe(false);
    expect(isImportableAsDocument(null)).toBe(false);
  });
});

describe("useTextDocumentExport", () => {
  it("saves the draft before it exports a file and returns true", async () => {
    const order: string[] = [];
    const flush = jest.fn(async () => {
      order.push("flush");
    });
    exportMutate.mockImplementation(async () => {
      order.push("export");
      return { asset_id: "a2", name: "Plan.pdf", path: "docs/Plan.pdf" };
    });
    const { result } = renderHook(() => useTextDocumentExport("a1", flush));
    let ok = false;
    await act(async () => {
      ok = await result.current.exportDocument("pdf");
    });
    expect(ok).toBe(true);
    expect(order).toEqual(["flush", "export"]);
    expect(exportMutate).toHaveBeenCalledWith({
      asset_id: "a1",
      format: "pdf",
      directory: undefined,
      name: undefined
    });
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", content: "Exported docs/Plan.pdf" })
    );
  });

  it("exports md and txt formats with destination directory and trimmed name", async () => {
    exportMutate.mockResolvedValueOnce({
      asset_id: "a3",
      name: "Release.md",
      path: "exports/Release.md"
    });
    exportMutate.mockResolvedValueOnce({
      asset_id: "a4",
      name: "Notes.txt",
      path: "exports/Notes.txt"
    });
    const { result } = renderHook(() => useTextDocumentExport("a1", async () => {}));

    let mdOk = false;
    let txtOk = false;
    await act(async () => {
      mdOk = await result.current.exportDocument("md", {
        directory: "exports",
        name: "  Release  "
      });
      txtOk = await result.current.exportDocument("txt", {
        directory: "exports",
        name: "Notes"
      });
    });

    expect(mdOk).toBe(true);
    expect(txtOk).toBe(true);
    expect(exportMutate).toHaveBeenNthCalledWith(1, {
      asset_id: "a1",
      format: "md",
      directory: "exports",
      name: "Release"
    });
    expect(exportMutate).toHaveBeenNthCalledWith(2, {
      asset_id: "a1",
      format: "txt",
      directory: "exports",
      name: "Notes"
    });
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", content: "Exported exports/Release.md" })
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", content: "Exported exports/Notes.txt" })
    );
  });

  it("passes trimmed name as title when exporting a Google Doc", async () => {
    const popup = { location: { href: "" }, close: jest.fn() };
    window.open = jest.fn(() => popup as unknown as Window);
    exportGoogleMutate.mockResolvedValue({
      document_id: "g1",
      name: "Launch Brief",
      url: "https://docs.google.com/document/d/g1/edit"
    });
    const { result } = renderHook(() => useTextDocumentExport("a1", async () => {}));

    let ok = false;
    await act(async () => {
      ok = await result.current.exportDocument("google_doc", {
        name: "  Launch Brief  "
      });
    });

    expect(ok).toBe(true);
    expect(exportGoogleMutate).toHaveBeenCalledWith({
      asset_id: "a1",
      title: "Launch Brief"
    });
    expect(popup.location.href).toBe("https://docs.google.com/document/d/g1/edit");
  });

  it("shows the server's message and returns false when an export fails", async () => {
    window.open = jest.fn(() => null);
    exportGoogleMutate.mockRejectedValue(new Error("Sign in with Google in Settings to use Google Docs."));
    const { result } = renderHook(() => useTextDocumentExport("a1", async () => {}));
    let ok = true;
    await act(async () => {
      ok = await result.current.exportDocument("google_doc");
    });
    expect(ok).toBe(false);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", content: expect.stringContaining("Sign in with Google") })
    );
  });
});

describe("useTextDocumentImport", () => {
  it("opens the imported document in a tab", async () => {
    importMutate.mockResolvedValue({ asset_id: "d1", name: "Brief.md", path: "Brief.md" });
    const { result } = renderHook(() => useTextDocumentImport());
    await act(async () => {
      await result.current.importAsset("src1", "p1");
    });
    expect(importMutate).toHaveBeenCalledWith({ asset_id: "src1" });
    expect(openForegroundTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "text", ref: "d1", projectId: "p1" })
    );
  });

  it("imports a Google Doc into no project from the loose bucket", async () => {
    importGoogleMutate.mockResolvedValue({ asset_id: "d2", name: "Doc.md", path: "Doc.md" });
    const { result } = renderHook(() => useTextDocumentImport());
    await act(async () => {
      await result.current.importGoogleDoc("https://docs.google.com/document/d/abc/edit", "loose");
    });
    expect(importGoogleMutate).toHaveBeenCalledWith({
      document: "https://docs.google.com/document/d/abc/edit",
      project_id: null
    });
  });
});
