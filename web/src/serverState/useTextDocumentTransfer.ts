/**
 * Import into and export out of the document editor (document editor PRD
 * R17-R19), through `trpc.textDocuments.import`, `export`,
 * `importGoogleDoc` and `exportGoogleDoc`.
 *
 * An import creates a Markdown document beside its source and opens it in a
 * tab. A file export writes a PDF or HTML file next to the document. A Google
 * Docs export creates a doc in the user's Drive and opens it in a browser tab.
 * Each failure shows the server's message, which names the fix.
 */
import { useCallback, useState } from "react";

import { queryClient } from "../queryClient";
import { trpcClient } from "../trpc/client";
import type { RouterOutputs } from "../trpc/client";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";

export type TextDocumentFile = RouterOutputs["textDocuments"]["import"];

export type DocumentExportFormat = "md" | "txt" | "pdf" | "html" | "google_doc";

export interface DocumentExportOptions {
  directory?: string;
  name?: string;
}

/** File extensions an import reads. Markdown already opens as a document. */
const IMPORTABLE_EXTENSIONS = new Set(["txt", "html", "htm", "docx", "pdf"]);

/** Whether a file of this name can be imported as a document. */
export const isImportableAsDocument = (name: string | null | undefined): boolean => {
  const extension = (name ?? "").toLowerCase().split(".").pop() ?? "";
  return IMPORTABLE_EXTENSIONS.has(extension);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const refreshDocumentLists = (): void => {
  void queryClient.invalidateQueries({ queryKey: [["documents"]] });
  void queryClient.invalidateQueries({ queryKey: ["assets"] });
};

interface UseTextDocumentImportResult {
  /** Import file asset `assetId` and open the new document. */
  importAsset: (assetId: string, projectId?: string | null) => Promise<TextDocumentFile | null>;
  /** Import a Google Doc by link or id and open the new document. */
  importGoogleDoc: (document: string, projectId: string | null) => Promise<TextDocumentFile | null>;
  importing: boolean;
}

export function useTextDocumentImport(): UseTextDocumentImportResult {
  const [importing, setImporting] = useState(false);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const run = useCallback(
    async (
      body: () => Promise<TextDocumentFile>,
      projectId: string | null
    ): Promise<TextDocumentFile | null> => {
      setImporting(true);
      try {
        const created = await body();
        refreshDocumentLists();
        openTab({
          type: "text",
          ref: created.asset_id,
          mode: "edit",
          title: created.name,
          projectId: projectId ?? LOOSE_PROJECT_ID
        });
        return created;
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not import the document: ${errorMessage(error)}`
        });
        return null;
      } finally {
        setImporting(false);
      }
    },
    [addNotification, openTab]
  );

  const importAsset = useCallback(
    (assetId: string, projectId: string | null = null) =>
      run(() => trpcClient.textDocuments.import.mutate({ asset_id: assetId }), projectId),
    [run]
  );

  const importGoogleDoc = useCallback(
    (document: string, projectId: string | null) =>
      run(
        () =>
          trpcClient.textDocuments.importGoogleDoc.mutate({
            document,
            project_id: projectId === LOOSE_PROJECT_ID ? null : projectId
          }),
        projectId
      ),
    [run]
  );

  return { importAsset, importGoogleDoc, importing };
}

interface UseTextDocumentExportResult {
  exportDocument: (
    format: DocumentExportFormat,
    options?: DocumentExportOptions
  ) => Promise<boolean>;
  exporting: DocumentExportFormat | null;
}

/** Export document `assetId`. `flush` saves the open draft first. */
export function useTextDocumentExport(
  assetId: string,
  flush: () => Promise<void>
): UseTextDocumentExportResult {
  const [exporting, setExporting] = useState<DocumentExportFormat | null>(null);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const exportDocument = useCallback(
    async (
      format: DocumentExportFormat,
      options?: DocumentExportOptions
    ): Promise<boolean> => {
      setExporting(format);
      // Opened before the await, so the browser treats it as the click's popup.
      const googleTab = format === "google_doc" ? window.open("", "_blank") : null;
      try {
        await flush();
        if (format === "google_doc") {
          const doc = await trpcClient.textDocuments.exportGoogleDoc.mutate({
            asset_id: assetId,
            title: options?.name?.trim() || undefined
          });
          if (googleTab && doc.url) {
            googleTab.location.href = doc.url;
          } else {
            googleTab?.close();
          }
          addNotification({ type: "success", content: `Exported to Google Docs as ${doc.name}` });
          return true;
        }
        const file = await trpcClient.textDocuments.export.mutate({
          asset_id: assetId,
          format,
          directory: options?.directory,
          name: options?.name?.trim() || undefined
        });
        refreshDocumentLists();
        addNotification({ type: "success", content: `Exported ${file.path ?? file.name}` });
        return true;
      } catch (error) {
        googleTab?.close();
        addNotification({
          type: "error",
          alert: true,
          content: `Could not export the document: ${errorMessage(error)}`
        });
        return false;
      } finally {
        setExporting(null);
      }
    },
    [addNotification, assetId, flush]
  );

  return { exportDocument, exporting };
}
