/**
 * Sharing seen from one person, for the admin of a self-hosted server: the
 * active links they created, the grants they gave, and the grants they hold,
 * across workflows and every other shared document kind.
 *
 * Only a document's owner can create a link or invite someone, so
 * `created_by` and `invited_by` name the owner at the time.
 */
import { and, eq, isNull } from "drizzle-orm";

import { getPortableDb } from "./db.js";
import { DocumentCollaborator, DocumentShare } from "./document-sharing.js";
import {
  documentCollaborators,
  documentShares
} from "./schema/document-sharing.js";
import {
  workflowCollaborators,
  workflowShares
} from "./schema/workflow-sharing.js";
import { workflows } from "./schema/workflows.js";
import { WorkflowCollaborator } from "./workflow-collaborator.js";
import { WorkflowShare } from "./workflow-share.js";

export interface UserSharing {
  workflowLinks: WorkflowShare[];
  documentLinks: DocumentShare[];
  workflowGrantsGiven: WorkflowCollaborator[];
  documentGrantsGiven: DocumentCollaborator[];
  workflowGrantsHeld: WorkflowCollaborator[];
  documentGrantsHeld: DocumentCollaborator[];
}

export async function getUserSharing(userId: string): Promise<UserSharing> {
  const db = getPortableDb();
  const [
    workflowLinks,
    documentLinks,
    workflowGrantsGiven,
    documentGrantsGiven,
    workflowGrantsHeld,
    documentGrantsHeld
  ] = await Promise.all([
    db
      .select()
      .from(workflowShares)
      .where(
        and(eq(workflowShares.created_by, userId), isNull(workflowShares.revoked_at))
      ),
    db
      .select()
      .from(documentShares)
      .where(
        and(eq(documentShares.created_by, userId), isNull(documentShares.revoked_at))
      ),
    db
      .select()
      .from(workflowCollaborators)
      .where(eq(workflowCollaborators.invited_by, userId)),
    db
      .select()
      .from(documentCollaborators)
      .where(eq(documentCollaborators.invited_by, userId)),
    WorkflowCollaborator.listForUser(userId),
    DocumentCollaborator.listForUser(userId)
  ]);
  return {
    workflowLinks: workflowLinks.map((row) => new WorkflowShare(row)),
    documentLinks: documentLinks.map((row) => new DocumentShare(row)),
    workflowGrantsGiven: workflowGrantsGiven.map(
      (row) => new WorkflowCollaborator(row)
    ),
    documentGrantsGiven: documentGrantsGiven.map(
      (row) => new DocumentCollaborator(row)
    ),
    workflowGrantsHeld,
    documentGrantsHeld
  };
}

/** The person's workflows that anyone can view. */
export async function listPublicWorkflows(
  userId: string
): Promise<Array<{ id: string; name: string }>> {
  return getPortableDb()
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(and(eq(workflows.user_id, userId), eq(workflows.access, "public")));
}
