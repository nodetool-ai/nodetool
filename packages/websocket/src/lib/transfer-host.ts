/**
 * The server's side of a transfer into a cloud project: the storage it
 * stages files in, the access rules it checks and the reference sets it
 * writes after a commit (`@nodetool-ai/project-services/cloud-transfer`).
 */
import type { TransferHost } from "@nodetool-ai/project-services/cloud-transfer";
import { effectiveAccess } from "./document-access.js";
import { findUnreadableFile, publishStoredDocument } from "./document-refs.js";
import { getAssetAdapter } from "./storage.js";

export function transferHost(): TransferHost {
  return {
    storage: getAssetAdapter(),
    async documentRole(userId, kind, id) {
      return (await effectiveAccess(userId, kind, id))?.role ?? null;
    },
    checkAttach(userId, kind, target, content) {
      return findUnreadableFile(kind, target, userId, content);
    },
    published(kind, id, toAdmit) {
      return publishStoredDocument(kind, id, toAdmit);
    }
  };
}
