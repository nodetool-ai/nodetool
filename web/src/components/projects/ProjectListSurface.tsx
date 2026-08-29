import { useCallback, useMemo, useState, type DragEvent } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  ScrollArea,
  SearchInput,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { isRecord, isString } from "../../utils/typePredicates";
import type { RouterOutputs } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import {
  useAssignDocument,
  useOpenNewProjectTab,
  useOpenProject,
  useProjectSummaries,
  useUnassignedDocuments
} from "../../hooks/useProjects";
import ProjectCard from "./ProjectCard";
import { PROJECT_COLOR } from "./projectIdentity";
import type { ProjectDetail } from "./projectStatus";

/**
 * How many loose documents the strip lists. Every document a user has ever
 * made is loose until they file it, so the strip shows the newest and says it
 * is showing only those.
 */
const LOOSE_STRIP_LIMIT = 12;

/** A loose document travels as its `(type, ref, name)` on the drag payload. */
type LooseDocument = RouterOutputs["projects"]["unassigned"][number];

const PROJECT_DOCUMENT_TYPES: readonly LooseDocument["type"][] = [
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
];

const isLooseDocument = (value: unknown): value is LooseDocument => {
  if (!isRecord(value)) {
    return false;
  }
  const { type, ref, name } = value;
  return (
    isString(type) &&
    (PROJECT_DOCUMENT_TYPES as readonly string[]).includes(type) &&
    isString(ref) &&
    isString(name)
  );
};

/** The strip's own drag payload, or nothing when the drag came from elsewhere. */
const parseDragPayload = (payload: string): LooseDocument | null => {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isLooseDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * The projects list: every project as a card, and beneath them the documents
 * that belong to none. Dragging one of those onto a card moves it in.
 */
const ProjectListSurface = () => {
  const [search, setSearch] = useState("");

  const summaries = useProjectSummaries();
  const unassigned = useUnassignedDocuments();
  const assignDocument = useAssignDocument();
  const openProject = useOpenProject();
  const openNewProject = useOpenNewProjectTab();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = summaries.data ?? [];
    return needle
      ? all.filter((entry) =>
          entry.project.name.toLowerCase().includes(needle)
        )
      : all;
  }, [search, summaries.data]);

  const looseTotal = unassigned.data?.length ?? 0;
  const loose = useMemo(
    () => (unassigned.data ?? []).slice(0, LOOSE_STRIP_LIMIT),
    [unassigned.data]
  );

  const handleOpen = useCallback(
    (project: ProjectDetail["project"]) => {
      void openProject(project);
    },
    [openProject]
  );

  const handleDropDocument = useCallback(
    (projectId: string, payload: string) => {
      const document = parseDragPayload(payload);
      if (!document) {
        return;
      }
      assignDocument.mutate(
        { projectId, type: document.type, ref: document.ref },
        {
          onError: (error) =>
            addNotification({
              type: "error",
              alert: true,
              content: `Could not move ${document.name}: ${error.message}`
            })
        }
      );
    },
    [addNotification, assignDocument]
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, document: LooseDocument) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(document));
    },
    []
  );

  return (
    <FlexColumn fullHeight sx={{ overflow: "hidden" }}>
      <FlexRow
        align="center"
        gap={SPACING.xl}
        sx={{ px: SPACING.xxl, pt: SPACING.xxl, pb: SPACING.md }}
      >
        <Text size="big">Projects</Text>
        <Caption color="secondary">
          One piece of work — the documents an agent built for it, what it
          cost, where it stands.
        </Caption>
        <Box sx={{ flex: 1 }} />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects"
        />
        <EditorButton
          variant="contained"
          color="primary"
          onClick={openNewProject}
        >
          + New project
        </EditorButton>
      </FlexRow>

      <ScrollArea fullHeight sx={{ px: SPACING.xxl, py: SPACING.xl }}>
        {summaries.isPending ? (
          <LoadingSpinner />
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: SPACING.xl,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))"
              }
            }}
          >
            {matches.map((detail) => (
              <ProjectCard
                key={detail.project.id}
                detail={detail}
                onOpen={handleOpen}
                onDropDocument={handleDropDocument}
              />
            ))}
            <Box
              component="button"
              type="button"
              onClick={openNewProject}
              sx={{
                minHeight: "268px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.lg,
                border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                borderRadius: BORDER_RADIUS.lg,
                background: "transparent",
                color: "text.secondary",
                cursor: "pointer"
              }}
            >
              <Box sx={{ color: PROJECT_COLOR, fontSize: "var(--fontSizeBig)" }}>
                +
              </Box>
              <Label>Start a project</Label>
              <Caption color="muted">
                Say what you want made, and an agent builds its documents
              </Caption>
            </Box>
          </Box>
        )}
      </ScrollArea>

      {loose.length > 0 && (
        <Box sx={{ px: SPACING.xxl, pb: SPACING.xl }}>
          <Divider />
          <FlexRow
            align="center"
            gap={SPACING.lg}
            sx={{ pt: SPACING.lg, pb: SPACING.md }}
          >
            <Caption
              color="muted"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Not in a project
            </Caption>
            {looseTotal > loose.length && (
              <Caption color="muted">
                {`${loose.length} most recent of ${looseTotal}`}
              </Caption>
            )}
            <Box sx={{ flex: 1 }} />
            <Caption color="muted">Drag onto a project card to move it in</Caption>
          </FlexRow>
          <FlexRow gap={SPACING.lg} wrap>
            {loose.map((document) => (
              <FlexRow
                key={`${document.type}:${document.ref}`}
                align="center"
                gap={SPACING.md}
                draggable
                onDragStart={(event: DragEvent<HTMLDivElement>) =>
                  handleDragStart(event, document)
                }
                onClick={() =>
                  openTab({
                    type: document.type,
                    ref: document.ref,
                    title: document.name
                  })
                }
                sx={{
                  px: SPACING.lg,
                  height: "30px",
                  cursor: "grab",
                  bgcolor: "background.paper",
                  border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: BORDER_RADIUS.md
                }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    color: TYPE_COLOR[document.type],
                    ...TYPOGRAPHY.sans.caption
                  }}
                >
                  {TYPE_GLYPH[document.type]}
                </Box>
                <Label color="secondary">{document.name}</Label>
              </FlexRow>
            ))}
          </FlexRow>
        </Box>
      )}
    </FlexColumn>
  );
};

export default ProjectListSurface;
