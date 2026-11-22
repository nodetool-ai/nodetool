/**
 * Opens a document of the signed-in cloud server in the desktop app
 * (WP1.15). Only the kinds of D26 whose drafts the cloud window keeps. The document opens in the
 * cloud window (D27), which the main process opens or brings forward.
 */
import { LOOSE_PROJECT_ID, useWorkspaceTabsStore, type WorkspaceTabType } from "../../stores/WorkspaceTabsStore";
import type { CloudDocumentRef, CloudWindowOpenResult } from "../../window";
import type { DocumentOrigin } from "./documentOrigin";

export interface CloudDocumentToOpen {
  origin: Extract<DocumentOrigin, { kind: "cloud" }>;
  type: WorkspaceTabType;
  id: string;
  name: string;
  /** The account's role: its own document, or a grant another user gave it. */
  role: "owner" | "viewer" | "editor";
}

/** The cloud window's reference to a document, or null for a type it does not open. */
export function cloudDocumentRef(type: WorkspaceTabType, id: string): CloudDocumentRef | null {
  return type === "workflow" ||
    type === "timeline" ||
    type === "jsscript" ||
    type === "script" ||
    type === "storyboard"
    ? { type, id }
    : null;
}

/**
 * From the local window: asks the main process to show the document in the
 * cloud window. Null outside the desktop app and for a type the cloud window
 * does not open.
 */
export const openCloudDocument = async (
  document: CloudDocumentToOpen
): Promise<CloudWindowOpenResult | null> => {
  const cloud = window.api?.cloud;
  const ref = cloudDocumentRef(document.type, document.id);
  return cloud && ref ? cloud.openDocument(ref) : null;
};

/**
 * In the cloud window: shows a document as a tab. The page's server is the
 * cloud server, so the tab loads the document as any tab would. The title
 * comes from the document when it loads.
 */
export const showCloudWindowDocument = (document: CloudDocumentRef): void => {
  const tabs = useWorkspaceTabsStore.getState();
  tabs.setActiveProjectId(null);
  tabs.openTab({
    type: document.type,
    ref: document.id,
    projectId: LOOSE_PROJECT_ID
  });
};
