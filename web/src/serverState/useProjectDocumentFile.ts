import type { projects } from "@nodetool-ai/protocol/api-schemas";

import { trpc } from "../trpc/client";

export type ProjectDocumentFile = projects.ProjectDocumentFile;
export type FileDocumentType = projects.FileDocumentType;

/**
 * The file a workflow or timeline has in its project folder: ok, invalid
 * with the error, or missing. Read from `projects.documents`, which a
 * `documentfile` resource change refetches when the reconcile finds the file
 * changed. Null while the list loads, for a document without a file, and for
 * a document the list does not hold.
 */
export const useProjectDocumentFile = (
  type: FileDocumentType,
  ref: string,
  projectId: string | null
): ProjectDocumentFile | null => {
  const { data } = trpc.projects.documents.useQuery(
    { id: projectId ?? "" },
    { enabled: Boolean(projectId), staleTime: 15_000 }
  );
  const document = data?.find(
    (entry) => entry.type === type && entry.ref === ref
  );
  return document?.file ?? null;
};
