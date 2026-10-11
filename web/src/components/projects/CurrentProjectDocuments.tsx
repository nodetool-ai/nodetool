import { useCallback, useEffect, useState } from "react";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import ProjectDocumentCard from "./ProjectDocumentCard";
import ProjectSelector from "./ProjectSelector";
import type { ProjectDocument } from "./projectStatus";

const DOCUMENTS_PER_PAGE = 4;

const CurrentProjectDocuments = () => {
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const projectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
      ? activeProjectId
      : personalProjectId;
  const [pageState, setPageState] = useState({ projectId, page: 0 });
  const requestedPage = pageState.projectId === projectId ? pageState.page : 0;
  const utils = trpc.useUtils();
  // One page of cards per request: the server reads whole only the documents
  // on it, rather than every document, entity and ledger row in the project.
  // Unbatched, so the cards do not wait on the start page's slower queries.
  const { data, isPending, error } = trpc.projects.documentPage.useQuery(
    {
      id: projectId ?? "",
      offset: requestedPage * DOCUMENTS_PER_PAGE,
      limit: DOCUMENTS_PER_PAGE
    },
    {
      enabled: Boolean(projectId),
      staleTime: 15_000,
      trpc: { context: { skipBatch: true } }
    }
  );
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / DOCUMENTS_PER_PAGE);
  const page = Math.min(requestedPage, Math.max(pageCount - 1, 0));
  const hasNextPage = page < pageCount - 1;
  // Documents removed while a later page was open: step back to the last page
  // that still has cards rather than showing an empty one.
  useEffect(() => {
    if (data && requestedPage > page) {
      setPageState({ projectId, page });
    }
  }, [data, requestedPage, page, projectId]);
  // Fetch the next page ahead, so Next shows cached cards instead of a spinner.
  useEffect(() => {
    if (!projectId || !hasNextPage) return;
    void utils.projects.documentPage.prefetch(
      {
        id: projectId,
        offset: (page + 1) * DOCUMENTS_PER_PAGE,
        limit: DOCUMENTS_PER_PAGE
      },
      { staleTime: 15_000, trpc: { context: { skipBatch: true } } }
    );
  }, [utils, projectId, page, hasNextPage]);
  const openDocument = useCallback(
    (document: ProjectDocument) => {
      if (!projectId) return;
      openTab({
        type: document.type,
        ref: document.ref,
        title: document.name,
        projectId
      });
    },
    [openTab, projectId]
  );

  if (!projectId) return null;

  const documents = data?.documents ?? [];
  const firstDocument = page * DOCUMENTS_PER_PAGE;
  return (
    <FlexColumn gap={SPACING.md} aria-label="Current project documents">
      <FlexRow align="center" gap={SPACING.md} wrap>
        <ProjectSelector inline />
        <Caption color="muted">
          Documents{total > 0 ? ` · ${total}` : ""}
        </Caption>
      </FlexRow>
      {isPending ? (
        <LoadingSpinner />
      ) : error ? (
        <Caption color="error">{error.message}</Caption>
      ) : documents.length === 0 ? (
        <Caption color="muted">No documents in this project yet.</Caption>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: SPACING.md,
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 190px), 1fr))"
          }}
        >
          {documents.map((document) => (
            <ProjectDocumentCard
              key={`${document.type}:${document.ref}`}
              document={document}
              sourceProjectId={projectId}
              onOpen={openDocument}
              compact
            />
          ))}
        </Box>
      )}
      {pageCount > 1 && (
        <FlexRow align="center" gap={SPACING.sm}>
          <EditorButton
            variant="outlined"
            density="compact"
            disabled={page === 0}
            onClick={() => setPageState({ projectId, page: page - 1 })}
          >
            Previous
          </EditorButton>
          <Caption color="secondary">
            {firstDocument + 1}–
            {Math.min(firstDocument + DOCUMENTS_PER_PAGE, total)} of {total}
          </Caption>
          <EditorButton
            variant="outlined"
            density="compact"
            disabled={!hasNextPage}
            onClick={() => setPageState({ projectId, page: page + 1 })}
          >
            Next
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export default CurrentProjectDocuments;
