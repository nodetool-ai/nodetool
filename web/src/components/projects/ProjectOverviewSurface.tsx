/**
 * A project's overview tab: the conversation that builds it, what it is made
 * of, and what it has cost.
 *
 * Everything here is derived from the documents the project holds — there is
 * no project content of its own to show. The header's next step names what the
 * documents are waiting on and opens the one that performs it; the render's own
 * controls live there, not here.
 *
 * The two halves swap priority with the viewport. On a desktop width both are
 * on screen at once, the agent in a resizable left dock. On a phone there is
 * room for one, and the conversation is the one that has to be there: the
 * documents move into a sheet the header's Documents button opens.
 */

import { useCallback, useState } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import {
  Box,
  Caption,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  MobileBottomSheet,
  SPACING,
  ScrollArea,
  StatusPill,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import ProjectAgentPanel from "./ProjectAgentPanel";
import ProjectDocumentCard from "./ProjectDocumentCard";
import ProjectSpendBar from "./ProjectSpendBar";
import {
  formatSpend,
  projectNextStep,
  projectProgress,
  projectStatusLine,
  type ProjectDocument
} from "./projectStatus";

interface ProjectOverviewSurfaceProps {
  /** The project id — the tab's `ref`. */
  refId: string;
}

/** Width of the agent column, per the overview mockup. */
const AGENT_COLUMN_WIDTH = 460;

const ProjectOverviewSurface = ({ refId }: ProjectOverviewSurfaceProps) => {
  // Documents the agent writes arrive as `resource_change` frames, which
  // invalidate this query — see `invalidateProjectViews`. Nothing polls.
  const { data, isPending, error } = trpc.projects.get.useQuery(
    { id: refId },
    { staleTime: 15_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const theme = useTheme();
  // Below `md` the two columns do not both fit: the agent dock's own minimum
  // is 320px, which leaves a phone nothing for the cards beside it.
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const closeDocuments = useCallback(() => setDocumentsOpen(false), []);

  const openDocument = useCallback(
    (document: ProjectDocument) => {
      // The tab it opens covers this one, so the sheet must not be left open
      // behind it — coming back would land on the documents, not the chat.
      setDocumentsOpen(false);
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

  const { project, documents, spend } = data;
  const progress = projectProgress(documents);
  const nextStep = projectNextStep(documents);

  const documentCards =
    documents.length === 0 ? (
      <Caption color="muted">
        Nothing in this project yet. Anything you create while it is open lands
        here.
      </Caption>
    ) : (
      <Box
        sx={{
          display: "grid",
          gap: SPACING.lg,
          gridTemplateColumns: {
            xs: "1fr",
            lg: "repeat(2, minmax(0, 1fr))"
          }
        }}
      >
        {documents.map((document) => (
          <ProjectDocumentCard
            key={`${document.type}:${document.ref}`}
            document={document}
            onOpen={openDocument}
          />
        ))}
      </Box>
    );

  const agent = (
    <ProjectAgentPanel
      projectId={project.id}
      projectName={project.name}
      threadId={project.threadId}
    />
  );

  return (
    <FlexColumn fullHeight sx={{ minHeight: 0 }}>
      <FlexRow
        align="center"
        gap={narrow ? SPACING.md : SPACING.xl}
        wrap={narrow}
        sx={{
          px: narrow ? SPACING.lg : SPACING.xxl,
          py: narrow ? SPACING.md : SPACING.xl,
          borderBottom: "1px solid",
          borderColor: "divider"
        }}
      >
        <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minWidth: 0 }}>
          <FlexRow align="center" gap={SPACING.md}>
            <Box component="span" aria-hidden sx={{ color: PROJECT_COLOR }}>
              {PROJECT_GLYPH}
            </Box>
            <Text size="big">{project.name}</Text>
            {progress && (
              <StatusPill tone={progress.done ? "done" : "neutral"}>
                {progress.label}
              </StatusPill>
            )}
          </FlexRow>
          <Caption color="secondary">{projectStatusLine(documents)}</Caption>
        </FlexColumn>
        {/* The narrow header keeps the two buttons; the spend reads off the
            bar in the sheet, where the figures it splits into also are. */}
        {!narrow && (
          <FlexColumn
            align="flex-end"
            gap={SPACING.xs}
            sx={{
              pr: SPACING.xl,
              borderRight: "1px solid",
              borderColor: "divider"
            }}
          >
            <Box component="span" sx={{ ...TYPOGRAPHY.mono.strong }}>
              {formatSpend(spend)}
            </Box>
            <Caption color="muted">so far · provider rates, no markup</Caption>
          </FlexColumn>
        )}
        {narrow && (
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={() => setDocumentsOpen(true)}
            aria-expanded={documentsOpen}
          >
            {`Documents · ${documents.length}`}
          </EditorButton>
        )}
        {nextStep && (
          <EditorButton
            variant="contained"
            density="normal"
            onClick={() => openDocument(nextStep.document)}
            title={`Opens ${nextStep.document.name}`}
          >
            {nextStep.label}
          </EditorButton>
        )}
      </FlexRow>

      <FlexRow sx={{ flex: 1, minHeight: 0 }}>
        {narrow ? (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
            {agent}
          </Box>
        ) : (
          <>
            <Box sx={{ flexShrink: 0, minHeight: 0, display: "flex" }}>
              <ResizableSideDock
                storageKey="projectAgent"
                side="left"
                defaultWidth={AGENT_COLUMN_WIDTH}
                minWidth={320}
                maxWidth={760}
                ariaLabel="Resize the project agent"
              >
                {agent}
              </ResizableSideDock>
            </Box>

            <FlexColumn sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <ScrollArea sx={{ flex: 1, minHeight: 0, px: SPACING.xxl }}>
                <FlexRow
                  align="baseline"
                  gap={SPACING.md}
                  sx={{ pt: SPACING.lg, pb: SPACING.md }}
                >
                  <Caption color="muted" sx={{ textTransform: "uppercase" }}>
                    Documents
                  </Caption>
                  <Box sx={{ flex: 1 }} />
                  <Caption color="muted">
                    everything below opens as a tab in this group
                  </Caption>
                </FlexRow>
                {documentCards}
              </ScrollArea>
              <Divider />
              <Box sx={{ px: SPACING.xxl, py: SPACING.lg }}>
                <ProjectSpendBar spend={spend} />
              </Box>
            </FlexColumn>
          </>
        )}
      </FlexRow>

      {narrow && (
        <MobileBottomSheet
          open={documentsOpen}
          onClose={closeDocuments}
          title="Documents"
          ariaLabel="Project documents"
        >
          <FlexColumn gap={SPACING.lg} sx={{ px: SPACING.lg, py: SPACING.lg }}>
            <Caption color="muted">
              everything below opens as a tab in this group
            </Caption>
            {documentCards}
            <Divider />
            <ProjectSpendBar spend={spend} />
          </FlexColumn>
        </MobileBottomSheet>
      )}
    </FlexColumn>
  );
};

export default ProjectOverviewSurface;
