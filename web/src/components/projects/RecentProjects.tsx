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
  SHADOW,
  SPACING,
  Text,
  TruncatedText,
  TYPOGRAPHY
} from "../ui_primitives";
import { relativeTime } from "../../utils/formatDateAndTime";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import type { ProjectDetail } from "./projectStatus";

/** How many projects the row shows. */
const RECENT_LIMIT = 4;
const STILL_HEIGHT = 120;

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
        sx={{ overflow: "hidden", boxShadow: (theme) => SHADOW(theme).sm }}
      >
        <Box
          sx={{
            height: STILL_HEIGHT,
            flexShrink: 0,
            bgcolor: "action.hover",
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
  if (recent.length === 0) {
    return null;
  }

  return (
    <FlexColumn
      component="section"
      aria-label={t("pass3_32.projects.home.recentProjects.heading")}
      gap={GAP.comfortable}
    >
      <FlexRow align="center" gap={GAP.normal}>
        <Text size="big" component="h2" sx={{ flex: 1 }}>
          {t("pass3_32.projects.home.recentProjects.heading")}
        </Text>
        <EditorButton
          variant="text"
          density="compact"
          endIcon={<ArrowForwardIcon />}
          onClick={handleViewAll}
        >
          {t("pass3_32.projects.home.recentProjects.viewAll")}
        </EditorButton>
      </FlexRow>
      {/* Four columns on a wide screen whatever the count, so two projects
          keep the size four would have. */}
      <Box
        sx={{
          display: "grid",
          gap: GAP.comfortable,
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            sm: "repeat(2, minmax(0, 1fr))",
            md: `repeat(${RECENT_LIMIT}, minmax(0, 1fr))`
          }
        }}
      >
        {recent.map((detail) => (
          <RecentProjectCard
            key={detail.project.id}
            detail={detail}
            onOpen={handleOpen}
          />
        ))}
      </Box>
    </FlexColumn>
  );
};

export default memo(RecentProjects);
