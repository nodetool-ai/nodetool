import { memo, useCallback, useMemo, useState, type DragEvent } from "react";

import { useTheme } from "@mui/material/styles";

import {
  Box,
  Card,
  Caption,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  SPACING,
  StatusPill,
  Tooltip,
  TruncatedText,
  TYPOGRAPHY,
  selectableTileStyles
} from "../ui_primitives";
import { relativeTime } from "../../utils/formatDateAndTime";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import {
  formatSpend,
  projectProgress,
  projectStatusLine,
  type ProjectDetail,
  type ProjectDocument
} from "./projectStatus";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import ProjectLifecycleActions from "./ProjectLifecycleActions";

const MEDIA_HEIGHT = 176;
const EMPTY_MEDIA_HEIGHT_XS = 72;

/** What each kind of project document is called in the card's tooltip. */
const DOCUMENT_NOUN: Record<ProjectDocument["type"], [string, string]> = {
  storyboard: ["board", "boards"],
  script: ["script", "scripts"],
  timeline: ["cut", "cuts"],
  sketch: ["sketch", "sketches"],
  application: ["app", "apps"],
  game: ["game", "games"],
  jsscript: ["JS script", "JS scripts"],
  workflow: ["workflow", "workflows"]
};

interface DocumentKindCount {
  type: ProjectDocument["type"];
  count: number;
}

/**
 * The project's documents counted by kind, in the order they first appear,
 * so a project of forty documents reads as a few glyphs instead of forty.
 */
const countByKind = (
  documents: readonly ProjectDocument[]
): DocumentKindCount[] => {
  const counts = new Map<ProjectDocument["type"], number>();
  for (const doc of documents) {
    counts.set(doc.type, (counts.get(doc.type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => ({ type, count }));
};

const describeKinds = (kinds: readonly DocumentKindCount[]): string =>
  kinds
    .map(({ type, count }) => {
      const [one, many] = DOCUMENT_NOUN[type];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(" · ");

interface ProjectCardProps {
  detail: ProjectDetail;
  onOpen: (project: ProjectDetail["project"]) => void;
  /** A loose document was dropped on the card — move it into this project. */
  onDropDocument: (projectId: string, payload: string) => void;
}

/**
 * One project in the list: what it looks like, how far it has got, and what
 * it cost. Export, archive and delete sit behind the overflow button.
 */
const ProjectCard = ({ detail, onOpen, onDropDocument }: ProjectCardProps) => {
  const theme = useTheme();
  const [dropActive, setDropActive] = useState(false);
  const { project, documents, spend } = detail;
  const stills = documents.flatMap((doc) => doc.thumbnails).slice(0, 3);
  const progress = projectProgress(documents);
  const kinds = useMemo(() => countByKind(documents), [documents]);
  const statusLine = projectStatusLine(documents);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropActive(false);
      onDropDocument(project.id, event.dataTransfer.getData("text/plain"));
    },
    [onDropDocument, project.id]
  );

  return (
    <Card
      variant="outlined"
      padding="none"
      clickable
      onClick={() => onOpen(project)}
      aria-label={project.name}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
      sx={{
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...selectableTileStyles(theme, { selected: dropActive })
      }}
    >
      <Box
        sx={{
          position: "relative",
          flexShrink: 0,
          // A project without stills keeps a short band on phones instead of
          // a tall empty frame.
          height:
            stills.length === 0
              ? { xs: `${EMPTY_MEDIA_HEIGHT_XS}px`, sm: `${MEDIA_HEIGHT}px` }
              : `${MEDIA_HEIGHT}px`,
          bgcolor: "action.hover",
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          display: "grid",
          gap: SPACING.micro,
          gridTemplateColumns: stills.length > 1 ? "2fr 1fr" : "1fr",
          gridTemplateRows: stills.length > 2 ? "1fr 1fr" : "1fr"
        }}
      >
        {stills.map((still, index) => (
          <ResponsiveImage
            key={still.asset_id ?? still.uri ?? index}
            locator={still}
            preferThumbnail
            alt=""
            fit="cover"
            sx={{
              width: "100%",
              height: "100%",
              gridRow: index === 0 && stills.length > 2 ? "span 2" : undefined
            }}
          />
        ))}
        {stills.length === 0 && (
          <FlexColumn
            align="center"
            justify="center"
            gap={SPACING.sm}
            fullHeight
          >
            {kinds.length > 0 && (
              <FlexRow
                gap={SPACING.lg}
                aria-hidden
                sx={{ display: { xs: "none", sm: "flex" } }}
              >
                {kinds.map(({ type }) => (
                  <Box
                    key={type}
                    component="span"
                    sx={{ color: TYPE_COLOR[type], ...TYPOGRAPHY.sans.title }}
                  >
                    {TYPE_GLYPH[type]}
                  </Box>
                ))}
              </FlexRow>
            )}
            <Caption color="muted">
              {documents.length === 0 ? "Nothing made yet" : "No stills yet"}
            </Caption>
          </FlexColumn>
        )}
      </Box>

      <FlexColumn
        gap={SPACING.sm}
        sx={{
          flex: 1,
          px: { xs: SPACING.lg, sm: SPACING.xl },
          pt: SPACING.lg,
          pb: { xs: SPACING.lg, sm: SPACING.xl }
        }}
      >
        <FlexRow align="center" gap={SPACING.md} sx={{ minHeight: 28 }}>
          <Box
            component="span"
            aria-hidden
            sx={{ color: PROJECT_COLOR, ...TYPOGRAPHY.sans.caption }}
          >
            {PROJECT_GLYPH}
          </Box>
          <TruncatedText sx={{ flex: 1, minWidth: 0, ...TYPOGRAPHY.sans.label }}
          >
            {project.name}
          </TruncatedText>
          {progress && (
            <StatusPill
              tone={progress.done ? "done" : "neutral"}
              sx={{ flexShrink: 0 }}
            >
              {progress.label}
            </StatusPill>
          )}
          <ProjectLifecycleActions project={project} layout="menu" />
        </FlexRow>
        <TruncatedText
          showTooltip
          sx={{ ...TYPOGRAPHY.sans.caption, color: "text.secondary" }}
        >
          {statusLine}
        </TruncatedText>
        <FlexRow align="center" gap={SPACING.md} sx={{ mt: "auto", pt: SPACING.sm }}>
          {kinds.length > 0 && (
            <Tooltip title={describeKinds(kinds)}>
              <FlexRow
                align="center"
                gap={SPACING.md}
                aria-label={describeKinds(kinds)}
                sx={{ minWidth: 0, overflow: "hidden" }}
              >
                {kinds.map(({ type, count }) => (
                  <FlexRow
                    key={type}
                    component="span"
                    align="center"
                    gap={SPACING.xs}
                    aria-hidden
                    sx={{ flexShrink: 0 }}
                  >
                    <Box
                      component="span"
                      sx={{ color: TYPE_COLOR[type], ...TYPOGRAPHY.sans.caption }}
                    >
                      {TYPE_GLYPH[type]}
                    </Box>
                    {count > 1 && (
                      <Caption component="span" color="secondary">
                        {count}
                      </Caption>
                    )}
                  </FlexRow>
                ))}
              </FlexRow>
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Spent at provider rates">
            <Box
              component="span"
              sx={{
                ...TYPOGRAPHY.mono.caption,
                color: "text.primary",
                whiteSpace: "nowrap"
              }}
            >
              {formatSpend(spend)}
            </Box>
          </Tooltip>
          <Caption color="muted" sx={{ whiteSpace: "nowrap" }}>
            {relativeTime(project.updatedAt)}
          </Caption>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(ProjectCard);
