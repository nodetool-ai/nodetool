import { useMemo } from "react";

import { useDocumentsSharedWithMe } from "../serverState/useDocumentSharing";
import { useSharedWithMe } from "../serverState/useWorkflowSharing";
import {
  DOCUMENT_TYPE_LABELS,
  UNTITLED_DOCUMENT_NAMES,
  type DocumentTreeGroup,
  type DocumentTreeLeaf
} from "./useDocumentTreeData";

/**
 * The navigator's "Shared with me" group: workflows and documents other users
 * shared with the caller, each carrying the caller's role. They belong to the
 * owner's project, so the group shows the same rows in every project. Null
 * when nothing is shared.
 */
export const useSharedDocumentGroup = (): DocumentTreeGroup | null => {
  const documentsQuery = useDocumentsSharedWithMe();
  const workflowsQuery = useSharedWithMe();

  return useMemo(() => {
    const workflows: DocumentTreeLeaf[] = (
      workflowsQuery.data?.workflows ?? []
    ).map((workflow) => ({
      id: workflow.id,
      name: workflow.name || UNTITLED_DOCUMENT_NAMES.workflow,
      type: "workflow",
      typeLabel: DOCUMENT_TYPE_LABELS.workflow,
      sharedRole: workflow.shared_role
    }));
    const documents: DocumentTreeLeaf[] = (
      documentsQuery.data?.documents ?? []
    ).map((document) => ({
      id: document.id,
      name: document.name || UNTITLED_DOCUMENT_NAMES[document.type],
      type: document.type,
      typeLabel: DOCUMENT_TYPE_LABELS[document.type],
      sharedRole: document.role
    }));
    const children = [...workflows, ...documents];
    return children.length > 0
      ? { id: "shared", label: "Shared with me", children }
      : null;
  }, [documentsQuery.data, workflowsQuery.data]);
};
