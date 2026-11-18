/**
 * Opens a document of the signed-in cloud server in the desktop app
 * (WP1.15). Workflows and timelines only (D26).
 */
import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";
import type { DocumentOrigin } from "./documentOrigin";

export interface CloudDocumentToOpen {
  origin: Extract<DocumentOrigin, { kind: "cloud" }>;
  type: WorkspaceTabType;
  id: string;
  name: string;
  /** The account's role: its own document, or a grant another user gave it. */
  role: "owner" | "viewer" | "editor";
}

export const openCloudDocument = (document: CloudDocumentToOpen): void => {
  void document;
};
