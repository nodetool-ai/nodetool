import { useCallback } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Card,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  ScrollArea,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import {
  formatSpend,
  projectStatusLine,
  type ProjectDocument
} from "./projectStatus";

interface ProjectOverviewSurfaceProps {
  /** The project id — the tab's `ref`. */
  refId: string;
}

const documentMeta = (document: ProjectDocument): string => {
  const spend = `$${document.spendUsd.toFixed(2)}`;
  return document.unpricedCount > 0
    ? `${spend} · ${document.unpricedCount} unpriced`
    : spend;
};

/**
 * A project's overview tab: what it is made of, and what it has cost.
 *
 * Phase 2 of the project view. The agent thread, the per-type thumbnails and
 * the spend bar are Phase 3 (`docs/plans/project-view/PLAN.md`, C1–C4); what
 * is here is the header and the document list they will be arranged around.
 */
const ProjectOverviewSurface = ({ refId }: ProjectOverviewSurfaceProps) => {
  const { data, isPending, error } = trpc.projects.get.useQuery(
    { id: refId },
    { staleTime: 15_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const openDocument = useCallback(
    (document: ProjectDocument) => {
      openTab({
        type: document.type,
        ref: document.ref,
        title: document.name,
        projectId: refId
      });
    },
    [openTab, refId]
  );

  if (isPending) {
    return <LoadingSpinner />;
  }
  if (error) {
    return (
      <FlexColumn fullHeight align="center" justify="center">
        <Caption color="error">{error.message}</Caption>
      </FlexColumn>
    );
  }

  return (
    <ScrollArea fullHeight sx={{ px: SPACING.xxl, py: SPACING.xxl }}>
      <FlexColumn gap={SPACING.xxl}>
        <FlexColumn gap={SPACING.md}>
          <FlexRow align="center" gap={SPACING.md}>
            <Box component="span" aria-hidden sx={{ color: PROJECT_COLOR }}>
              {PROJECT_GLYPH}
            </Box>
            <Text size="big">{data.project.name}</Text>
          </FlexRow>
          <Caption color="secondary">
            {projectStatusLine(data.documents)}
          </Caption>
          <FlexRow align="baseline" gap={SPACING.md}>
            <Box component="span" sx={{ ...TYPOGRAPHY.mono.strong }}>
              {formatSpend(data.spend)}
            </Box>
            <Caption color="muted">so far · provider rates, no markup</Caption>
          </FlexRow>
        </FlexColumn>

        {data.documents.length === 0 ? (
          <Caption color="muted">
            Nothing in this project yet. Anything you create while it is open
            lands here.
          </Caption>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: SPACING.xl,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))"
              }
            }}
          >
            {data.documents.map((document) => (
              <Card
                key={`${document.type}:${document.ref}`}
                variant="outlined"
                padding="normal"
                clickable
                onClick={() => openDocument(document)}
                aria-label={document.name}
                sx={{ borderRadius: BORDER_RADIUS.md }}
              >
                <FlexColumn gap={SPACING.sm}>
                  <FlexRow align="center" gap={SPACING.md}>
                    <Box
                      component="span"
                      aria-hidden
                      sx={{ color: TYPE_COLOR[document.type] }}
                    >
                      {TYPE_GLYPH[document.type]}
                    </Box>
                    <Label sx={{ flex: 1 }}>{document.name}</Label>
                  </FlexRow>
                  <Caption color="secondary">
                    {projectStatusLine([document])}
                  </Caption>
                  <Caption color="muted" sx={{ ...TYPOGRAPHY.mono.caption }}>
                    {documentMeta(document)}
                  </Caption>
                </FlexColumn>
              </Card>
            ))}
          </Box>
        )}
      </FlexColumn>
    </ScrollArea>
  );
};

export default ProjectOverviewSurface;
