/**
 * The server's side of a transfer into a cloud project: the storage it
 * stages files in, the access rules it checks and the reference sets it
 * writes after a commit (`@nodetool-ai/project-services/cloud-transfer`).
 */
import type { TransferHost } from "@nodetool-ai/project-services/cloud-transfer";
import { grantedAccess } from "./document-access.js";
import { findUnreadableFile, publishStoredDocument } from "./document-refs.js";
import { getAssetAdapter } from "./storage.js";

export function transferHost(): TransferHost {
  return {
    storage: getAssetAdapter(),
    // A public workflow is not a grant to transfer into (review F3).
    async documentRole(userId, kind, id) {
      return (await grantedAccess(userId, kind, id))?.role ?? null;
    },
    checkAttach(userId, kind, target, content) {
      return findUnreadableFile(kind, target, userId, content);
    },
    published(kind, id, toAdmit) {
      return publishStoredDocument(kind, id, toAdmit);
    }
  };
}
