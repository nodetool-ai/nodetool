/**
 * The start page's "Recent projects" row: the last few projects touched, each
 * a still and a name, so the way back into yesterday's work is one click. The
 * full list, with spend and progress, stays on the Projects surface.
 */

import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import {
  PROJECT_LIST_REF,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useProjectSummaries } from "../../hooks/useProjects";
import { useResumeProject } from "../../hooks/useResumeProject";
import ProjectLifecycleActions from "./ProjectLifecycleActions";
import {
  Box,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  SPACING,
  TruncatedText,
  TYPOGRAPHY
} from "../ui_primitives";
import { relativeTime } from "../../utils/formatDateAndTime";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import type { ProjectDetail } from "./projectStatus";
import StartSection, {
  START_CARD_COLUMNS,
  START_CARD_GRID_SX,
  START_CARD_SX,
  StartCardSkeletons
} from "./StartSection";

/** How many projects the row shows. */
const RECENT_LIMIT = START_CARD_COLUMNS;
const STILL_HEIGHT = 120;
/** The still plus the name and edited rows, for the loading placeholders. */
const CARD_HEIGHT = 180;

const RecentProjectCard = memo(
  ({
    detail,
    onOpen
  }: {
    detail: ProjectDetail;
    onOpen: (detail: ProjectDetail) => void;
  }) => {
    const { t } = useTranslation();
    const { project, documents } = detail;
    const still = documents.find((doc) => doc.thumbnails.length > 0)
      ?.thumbnails[0];
    return (
      <Card
        component={FlexColumn}
        variant="outlined"
        padding="none"
        radius="lg"
        clickable
        onClick={() => onOpen(detail)}
        aria-label={project.name}
        sx={START_CARD_SX}
      >
        <Box
          sx={{
            height: STILL_HEIGHT,
            flexShrink: 0,
            // A project with no picture yet gets a faint wash of its colour
            // rather than a grey slab.
            bgcolor: still
              ? "action.hover"
              : `color-mix(in srgb, ${PROJECT_COLOR} 6%, transparent)`,
            borderBottom: "1px solid",
            borderColor: "divider"
          }}
        >
          {still ? (
            <ResponsiveImage
              locator={still}
              preferThumbnail
              alt=""
              fit="cover"
              sx={{ width: "100%", height: "100%" }}
            />
          ) : (
            <FlexRow align="center" justify="center" fullHeight aria-hidden>
              <Box
                component="span"
                sx={{ color: PROJECT_COLOR, ...TYPOGRAPHY.sans.title }}
              >
                {PROJECT_GLYPH}
              </Box>
            </FlexRow>
          )}
        </Box>
        <FlexRow
          align="center"
          gap={GAP.normal}
          sx={{ px: SPACING.xl, py: SPACING.lg }}
        >
          <FlexColumn gap={GAP.micro} sx={{ flex: 1, minWidth: 0 }}>
            <TruncatedText sx={TYPOGRAPHY.sans.label}>
              {project.name}
            </TruncatedText>
            <Caption color="secondary">
              {t("pass3_32.projects.home.recentProjects.edited", {
                time: relativeTime(project.updatedAt)
              })}
            </Caption>
          </FlexColumn>
          <ProjectLifecycleActions project={project} layout="menu" />
        </FlexRow>
      </Card>
    );
  }
);
RecentProjectCard.displayName = "RecentProjectCard";

const RecentProjects = () => {
  const { t } = useTranslation();
  const summaries = useProjectSummaries();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const recent = useMemo(
    () =>
      [...(summaries.data ?? [])]
        .sort((a, b) =>
          b.project.updatedAt.localeCompare(a.project.updatedAt)
        )
        .slice(0, RECENT_LIMIT),
    [summaries.data]
  );

  const handleOpen = useResumeProject();

  const handleViewAll = useCallback(() => {
    openTab({
      type: "project-list",
      ref: PROJECT_LIST_REF,
      mode: "view",
      title: t("pass3_34.projects.rail.projects")
    });
  }, [openTab, t]);

  // Nothing to go back to yet: the creation cards above are the way in.
  if (!summaries.isPending && recent.length === 0) {
    return null;
  }

  return (
    <StartSection
      title={t("pass3_32.projects.home.recentProjects.heading")}
      action={
        <EditorButton
          variant="text"
          density="compact"
          endIcon={<ArrowForwardIcon />}
          onClick={handleViewAll}
        >
          {t("pass3_32.projects.home.recentProjects.viewAll")}
        </EditorButton>
      }
    >
      {/* Placeholders hold the row's place while the projects load, so the
          sections below do not jump down when they arrive. */}
      {summaries.isPending ? (
        <StartCardSkeletons height={CARD_HEIGHT} />
      ) : (
        // Four columns on a wide screen whatever the count, so two projects
        // keep the size four would have.
        <Box sx={START_CARD_GRID_SX}>
          {recent.map((detail) => (
            <RecentProjectCard
              key={detail.project.id}
              detail={detail}
              onOpen={handleOpen}
            />
          ))}
        </Box>
      )}
    </StartSection>
  );
};

export default memo(RecentProjects);
