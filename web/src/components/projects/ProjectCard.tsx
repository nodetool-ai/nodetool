import { memo, useCallback, useState, type DragEvent } from "react";

import {
  BORDER_RADIUS,
  Box,
  Card,
  Caption,
  FlexColumn,
  FlexRow,
  MOTION,
  ResponsiveImage,
  SPACING,
  StatusPill,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import { relativeTime } from "../../utils/formatDateAndTime";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import {
  formatSpend,
  projectProgress,
  projectStatusLine,
  type ProjectDetail
} from "./projectStatus";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";

const MEDIA_HEIGHT = 176;

interface ProjectCardProps {
  detail: ProjectDetail;
  onOpen: (project: ProjectDetail["project"]) => void;
  /** A loose document was dropped on the card — move it into this project. */
  onDropDocument: (projectId: string, payload: string) => void;
}

/**
 * One project in the list: what it has rendered, what it cost, and — for a
 * board that has stills — what it looks like.
 */
const ProjectCard = ({ detail, onOpen, onDropDocument }: ProjectCardProps) => {
  const [dropActive, setDropActive] = useState(false);
  const { project, documents, spend } = detail;
  const stills = documents.flatMap((doc) => doc.thumbnails).slice(0, 3);
  const progress = projectProgress(documents);

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
        borderRadius: BORDER_RADIUS.lg,
        borderColor: dropActive ? "primary.main" : "divider",
        transition: MOTION.border
      }}
    >
      <Box
        sx={{
          position: "relative",
          height: `${MEDIA_HEIGHT}px`,
          bgcolor: "background.paper",
          display: "grid",
          gap: "2px",
          gridTemplateColumns: stills.length > 1 ? "2fr 1fr" : "1fr",
          gridTemplateRows: stills.length > 2 ? "1fr 1fr" : "1fr"
        }}
      >
        {stills.map((still, index) => (
          <ResponsiveImage
            key={still.asset_id ?? still.uri ?? index}
            locator={still}
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
          <FlexRow align="center" justify="center" fullHeight>
            <Caption color="muted">No stills yet</Caption>
          </FlexRow>
        )}
        {progress && (
          <StatusPill
            tone={progress.done ? "done" : "neutral"}
            sx={{
              position: "absolute",
              left: SPACING.md,
              bottom: SPACING.md
            }}
          >
            {progress.label}
          </StatusPill>
        )}
      </Box>

      <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl }}>
        <FlexRow align="center" gap={SPACING.md}>
          <Box component="span" aria-hidden sx={{ color: PROJECT_COLOR }}>
            {PROJECT_GLYPH}
          </Box>
          <Text sx={{ flex: 1, ...TYPOGRAPHY.sans.label }}>{project.name}</Text>
          <Caption color="secondary">
            {relativeTime(project.updatedAt)}
          </Caption>
        </FlexRow>
        <Caption color="secondary">{projectStatusLine(documents)}</Caption>
        <FlexRow align="center" gap={SPACING.md}>
          <FlexRow gap={SPACING.sm} aria-hidden>
            {documents.map((doc) => (
              <Box
                key={`${doc.type}:${doc.ref}`}
                component="span"
                sx={{
                  color: TYPE_COLOR[doc.type],
                  ...TYPOGRAPHY.sans.caption
                }}
              >
                {TYPE_GLYPH[doc.type]}
              </Box>
            ))}
          </FlexRow>
          <Box sx={{ flex: 1 }} />
          <Box component="span" sx={{ ...TYPOGRAPHY.mono.caption }}>
            {formatSpend(spend)}
          </Box>
          <Caption color="muted">provider rates</Caption>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(ProjectCard);
