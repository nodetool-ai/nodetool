import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent
} from "react";
import { useTranslation } from "react-i18next";

import AddIcon from "@mui/icons-material/AddOutlined";

import {
  AutoGrid,
  Box,
  CONTROL,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  PageHeader,
  SPACING,
  ScrollArea,
  SearchInput,
  SectionHeader,
  TruncatedText,
  TYPOGRAPHY,
  activateOnKey,
  selectableRowStyles,
  selectableTileStyles
} from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { isRecord, isString } from "../../utils/typePredicates";
import type { RouterOutputs } from "../../trpc/client";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import {
  useAssignDocument,
  useArchivedProjects,
  useImportProject,
  useOpenProject,
  useProjectSummaries,
  useUnassignedDocuments
} from "../../hooks/useProjects";
import ProjectCard from "./ProjectCard";
import ProjectLifecycleActions from "./ProjectLifecycleActions";
import NewProjectDialog from "./NewProjectDialog";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import type { ProjectDetail } from "./projectStatus";
import { PROJECT_FILE_EXTENSION } from "../../utils/projectArchive";

/**
 * How many loose documents the strip lists. Every document a user has ever
 * made is loose until they file it, so the strip shows the newest and says it
 * is showing only those.
 */
const LOOSE_STRIP_LIMIT = 12;

/**
 * Narrowest project card: one column on a phone, two on a tablet, three on a
 * laptop-wide screen.
 */
const PROJECT_CARD_MIN_WIDTH = 360;

/** A loose document's name is cut short so one long title keeps its row. */
const LOOSE_TILE_MAX_WIDTH = 280;

/** The search box's width beside the title on a tablet or wider. */
const SEARCH_WIDTH = 280;

const formatRelativeTime = (
  date: Date | string,
  locale: string,
  now: number
): string => {
  const elapsedSeconds = Math.floor(
    (now - new Date(date).getTime()) / 1000
  );
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 60) {
    return formatter.format(-Math.max(elapsedSeconds, 0), "second");
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return formatter.format(-elapsedMinutes, "minute");
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return formatter.format(-elapsedHours, "hour");
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return formatter.format(-elapsedDays, "day");
  }
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 5) {
    return formatter.format(-elapsedWeeks, "week");
  }
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return formatter.format(-elapsedMonths, "month");
  }
  return formatter.format(-Math.floor(elapsedDays / 365), "year");
};

/** Page gutter: the desktop margin wastes a phone's width. */
const PAGE_PX = { xs: SPACING.lg, sm: SPACING.xxl };

/** A loose document travels as its `(type, ref, name)` on the drag payload. */
type LooseDocument = RouterOutputs["projects"]["unassigned"][number];

const PROJECT_DOCUMENT_TYPES: readonly LooseDocument["type"][] = [
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "game",
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
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");

  const summaries = useProjectSummaries();
  const archived = useArchivedProjects();
  const unassigned = useUnassignedDocuments();
  const assignDocument = useAssignDocument();
  const openProject = useOpenProject();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const openNewProject = useCallback(() => setNewProjectOpen(true), []);
  const closeNewProject = useCallback(() => setNewProjectOpen(false), []);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const importProject = useImportProject();
  const importInputRef = useRef<HTMLInputElement>(null);
  const chooseImportFile = useCallback(
    () => importInputRef.current?.click(),
    []
  );
  const handleImportFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Clear the input so choosing the same file again fires a change.
      event.target.value = "";
      if (!file) {
        return;
      }
      importProject.mutate(file, {
        onSuccess: (result) => {
          const problems =
            result.missing.length + result.checksum_mismatches.length;
          addNotification({
            type: problems > 0 ? "warning" : "success",
            alert: true,
            content:
              problems > 0
                ? t("pass3_34.projects.list.importedWithProblems", {
                    name: result.project.name,
                    count: problems
                  })
                : t("pass3_34.projects.list.imported", {
                    name: result.project.name
                  })
          });
          void openProject(result.project);
        },
        onError: (error) =>
          addNotification({
            type: "error",
            alert: true,
            content: t("pass3_34.projects.list.importFailed", {
              fileName: file.name,
              error: error.message
            })
          })
      });
    },
    [addNotification, importProject, openProject, t]
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
  const now = useMemo(() => Date.now(), []);
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
              content: t("pass3_34.projects.list.moveFailed", {
                name: document.name,
                error: error.message
              })
            })
        }
      );
    },
    [addNotification, assignDocument, t]
  );

  const handleOpenLoose = useCallback(
    (document: LooseDocument) =>
      openTab({
        type: document.type,
        ref: document.ref,
        title: document.name,
        projectId: LOOSE_PROJECT_ID
      }),
    [openTab]
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
      {/* On phones the search drops to its own full-width row and the
          explainer hides, so neither the title nor the button is squeezed. */}
      <FlexRow
        align="center"
        wrap
        sx={{
          columnGap: { xs: SPACING.md, sm: SPACING.xl },
          rowGap: SPACING.md,
          px: PAGE_PX,
          pt: { xs: SPACING.xl, sm: SPACING.xxl },
          pb: SPACING.lg
        }}
      >
        <PageHeader
          variant="plain"
          title={t("pass3_34.projects.list.title")}
          subtitle={t("pass3_34.projects.list.subtitle")}
          hideSubtitleOnMobile
        />
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            order: { xs: 1, sm: 0 },
            flexBasis: { xs: "100%", sm: SEARCH_WIDTH }
          }}
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("pass3_34.projects.list.searchPlaceholder")}
            fullWidth
          />
        </Box>
        <EditorButton
          variant="outlined"
          onClick={chooseImportFile}
          disabled={importProject.isPending}
          sx={{ whiteSpace: "nowrap" }}
        >
          {importProject.isPending
            ? t("pass3_34.projects.list.importing")
            : t("pass3_34.projects.list.importProject")}
        </EditorButton>
        <input
          ref={importInputRef}
          type="file"
          accept={`${PROJECT_FILE_EXTENSION},application/zip`}
          aria-label={t("pass3_34.projects.list.projectFile")}
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
        <EditorButton
          variant="contained"
          color="primary"
          onClick={openNewProject}
          startIcon={<AddIcon />}
          sx={{ whiteSpace: "nowrap" }}
        >
          {t("pass3_34.projects.list.newProject")}
        </EditorButton>
      </FlexRow>

      <ScrollArea fullHeight sx={{ px: PAGE_PX, pt: SPACING.md, pb: SPACING.xxl }}>
        {summaries.isPending ? (
          <LoadingSpinner />
        ) : summaries.error ? (
          <EmptyState
            variant="error"
            title={t("pass3_34.projects.list.loadFailed")}
            description={summaries.error.message}
          />
        ) : search.trim() && matches.length === 0 ? (
          <EmptyState
            variant="no-results"
            title={t("pass3_34.projects.list.noMatchingProjects")}
            description={t("pass3_34.projects.list.tryDifferentSearch")}
          />
        ) : (
          <AutoGrid
            minItemWidth={PROJECT_CARD_MIN_WIDTH}
            sx={{ gap: { xs: SPACING.lg, sm: SPACING.xl } }}
          >
            {matches.map((detail) => (
              <ProjectCard
                key={detail.project.id}
                detail={detail}
                onOpen={handleOpen}
                onDropDocument={handleDropDocument}
              />
            ))}
            <FlexColumn
              component="button"
              onClick={openNewProject}
              align="center"
              justify="center"
              gap={SPACING.sm}
              sx={(theme) => ({
                ...selectableTileStyles(theme),
                minHeight: { xs: 160, sm: 268 },
                px: SPACING.xl,
                borderStyle: "dashed",
                background: "transparent",
                color: "text.secondary",
                cursor: "pointer"
              })}
            >
              <AddIcon sx={{ color: PROJECT_COLOR, mb: SPACING.xs }} />
              <Label>{t("pass3_34.projects.list.startProject")}</Label>
              <Caption color="muted">
                {t("pass3_34.projects.list.startProjectDescription")}
              </Caption>
            </FlexColumn>
          </AutoGrid>
        )}

        {loose.length > 0 && (
          <FlexColumn gap={SPACING.md} sx={{ mt: SPACING.xxl }}>
            <SectionHeader
              size="small"
              title={
                looseTotal > loose.length
                  ? t("pass3_34.projects.list.loose.mostRecent", {
                      count: loose.length,
                      total: looseTotal
                    })
                  : t("pass3_34.projects.list.loose.title")
              }
              action={
                <Caption
                  color="muted"
                  sx={{ display: { xs: "none", sm: "block" } }}
                >
                  {t("pass3_34.projects.list.loose.dragHint")}
                </Caption>
              }
            />
            <FlexRow gap={SPACING.md} wrap>
              {loose.map((document) => (
                <FlexRow
                  key={`${document.type}:${document.ref}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("pass3_34.projects.list.loose.open", {
                    name: document.name
                  })}
                  align="center"
                  gap={SPACING.md}
                  draggable
                  onDragStart={(event: DragEvent<HTMLDivElement>) =>
                    handleDragStart(event, document)
                  }
                  onClick={() => handleOpenLoose(document)}
                  onKeyDown={activateOnKey(() => handleOpenLoose(document))}
                  sx={(theme) => ({
                    ...selectableTileStyles(theme),
                    px: SPACING.lg,
                    height: CONTROL.height.md,
                    maxWidth: LOOSE_TILE_MAX_WIDTH,
                    cursor: "grab",
                    bgcolor: "background.paper"
                  })}
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
                  <TruncatedText
                    showTooltip
                    sx={{ ...TYPOGRAPHY.sans.label, color: "text.secondary" }}
                  >
                    {document.name}
                  </TruncatedText>
                </FlexRow>
              ))}
            </FlexRow>
          </FlexColumn>
        )}

        {(archived.data?.length ?? 0) > 0 && (
          <FlexColumn gap={SPACING.sm} sx={{ mt: SPACING.xxl }}>
            <SectionHeader
              size="small"
              title={t("pass3_34.projects.list.archived", {
                count: archived.data?.length ?? 0
              })}
            />
            {archived.data?.map((project) => (
              <FlexRow
                key={project.id}
                align="center"
                gap={SPACING.md}
                sx={(theme) => ({
                  ...selectableRowStyles(theme),
                  px: SPACING.md,
                  minHeight: CONTROL.height.lg
                })}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: "text.disabled", ...TYPOGRAPHY.sans.caption }}
                >
                  {PROJECT_GLYPH}
                </Box>
                <TruncatedText
                  showTooltip
                  sx={{ flex: 1, minWidth: 0, ...TYPOGRAPHY.sans.label, color: "text.secondary" }}
                >
                  {project.name}
                </TruncatedText>
                {project.archivedAt && (
                  <Caption color="muted" sx={{ whiteSpace: "nowrap" }}>
                    {t("pass3_34.projects.list.archivedAt", {
                      relativeTime: formatRelativeTime(
                        project.archivedAt,
                        i18n.language,
                        now
                      )
                    })}
                  </Caption>
                )}
                <ProjectLifecycleActions project={project} />
              </FlexRow>
            ))}
          </FlexColumn>
        )}
      </ScrollArea>
      <NewProjectDialog open={newProjectOpen} onClose={closeNewProject} />
    </FlexColumn>
  );
};

export default ProjectListSurface;
