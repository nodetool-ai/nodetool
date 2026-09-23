import { useCallback } from "react";

import {
  Box,
  Caption,
  Card,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  ScrollArea,
  SPACING,
  Text
} from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { TYPE_COLOR, TYPE_GLYPH } from "../../workspace/tabTypeIdentity";
import { documentStatusLine, type ProjectDocument } from "../../projects/projectStatus";

interface ProjectDocumentsSidebarProps {
  projectId: string | null;
  active: boolean;
}

const ProjectDocumentsSidebar = ({ projectId, active }: ProjectDocumentsSidebarProps) => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { data, isPending, error } = trpc.projects.get.useQuery(
    { id: projectId ?? "" },
    { enabled: active && Boolean(projectId), staleTime: 15_000 }
  );
  const documents = data?.project.id === projectId ? data.documents : [];
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

  return (
    <FlexColumn
      component="aside"
      aria-label="Project documents"
      fullHeight
      sx={{
        width: { xs: "100%", md: "280px" },
        flexShrink: 0,
        minHeight: 0,
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper"
      }}
    >
      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg, borderBottom: "1px solid", borderColor: "divider" }}>
        <Text size="small">{data?.project.id === projectId ? data.project.name : "Current project"}</Text>
        <Caption color="muted">Documents · {documents.length}</Caption>
      </FlexColumn>
      <ScrollArea sx={{ flex: 1, minHeight: 0, p: SPACING.sm }}>
        {!projectId ? (
          <Caption color="muted">No project selected.</Caption>
        ) : isPending ? (
          <LoadingSpinner />
        ) : error ? (
          <Caption color="error">{error.message}</Caption>
        ) : documents.length === 0 ? (
          <Caption color="muted">No documents in this project yet.</Caption>
        ) : (
          <FlexColumn gap={SPACING.xs}>
            {documents.map((document) => (
              <Card
                key={`${document.type}:${document.ref}`}
                variant="outlined"
                padding="compact"
                clickable
                aria-label={document.name}
                onClick={() => openDocument(document)}
                sx={{ minWidth: 0 }}
              >
                <FlexRow align="center" gap={SPACING.sm} sx={{ minWidth: 0 }}>
                  <Box component="span" aria-hidden sx={{ color: TYPE_COLOR[document.type] }}>
                    {TYPE_GLYPH[document.type]}
                  </Box>
                  <FlexColumn sx={{ minWidth: 0, flex: 1 }}>
                    <Label
                      title={document.name}
                      sx={{ mb: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {document.name}
                    </Label>
                    <Caption
                      color="secondary"
                      sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {documentStatusLine(document)}
                    </Caption>
                  </FlexColumn>
                </FlexRow>
              </Card>
            ))}
          </FlexColumn>
        )}
      </ScrollArea>
    </FlexColumn>
  );
};

export default ProjectDocumentsSidebar;
