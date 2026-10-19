import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import { ALL_PROJECTS, useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetProjectScope } from "../../hooks/assets/useAssetProjectScope";
import { useProjects } from "../../hooks/useProjects";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useAuth } from "../../stores/useAuth";
import ErrorBanner from "../support/ErrorBanner";
import {
  Box,
  ContextMenu,
  EditorButton,
  MenuItemPrimitive,
  SPACING,
  TruncatedText,
  LoadingSpinner
} from "../ui_primitives";
import { PROJECT_COLOR, PROJECT_GLYPH } from "../projects/projectIdentity";

const projectGlyph = (
  <Box component="span" aria-hidden sx={{ color: PROJECT_COLOR }}>
    {PROJECT_GLYPH}
  </Box>
);

/**
 * Picks the project the asset explorer lists. It starts on the workspace's
 * project, and choosing another one, or every project, leaves the workspace
 * where it is.
 */
const AssetProjectFilter: React.FC = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { t } = useTranslation();
  const setProjectFilter = useAssetGridStore(
    (state) => state.setProjectFilter
  );
  const { scopeKey, activeProjectId } = useAssetProjectScope();
  const { data: projects, isPending, error } = useProjects();

  const workspacePersonalId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const userId = useAuth((state) => state.user?.id);

  const personalProjectId =
    projects?.find((project) => project.isPersonal)?.id ??
    workspacePersonalId ??
    (userId ? `personal:${userId}` : LOOSE_PROJECT_ID);
  const namedProjects = (projects ?? []).filter(
    (project) => !project.isPersonal
  );
  const isPersonalScope =
    scopeKey === personalProjectId || scopeKey === LOOSE_PROJECT_ID;
  const label =
    scopeKey === ALL_PROJECTS
      ? t("i18n-next43-assets-navigation.projectFilter.allProjects")
      : isPersonalScope
        ? t("i18n-next43-assets-navigation.projectFilter.personal")
        : (namedProjects.find((project) => project.id === scopeKey)?.name ??
          t("i18n-next43-assets-navigation.projectFilter.project"));

  const choose = useCallback(
    (projectId: string) => {
      // The workspace's own project is the default, not a pinned filter.
      setProjectFilter(projectId === activeProjectId ? null : projectId);
      setAnchor(null);
    },
    [activeProjectId, setProjectFilter]
  );

  return (
    <>
      <EditorButton
        variant="text"
        color={scopeKey === activeProjectId ? "inherit" : "primary"}
        density="compact"
        startIcon={scopeKey === ALL_PROJECTS ? undefined : projectGlyph}
        endIcon={<ArrowDropDownIcon />}
        tooltip={t("i18n-next43-assets-navigation.projectFilter.tooltip")}
        aria-haspopup="menu"
        aria-label={t("i18n-next43-assets-navigation.projectFilter.ariaLabel", {
          label
        })}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ maxWidth: 200 }}
      >
        <TruncatedText component="span" sx={{ fontSize: "inherit" }}>
          {label}
        </TruncatedText>
      </EditorButton>
      <ContextMenu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <MenuItemPrimitive
          label={t("i18n-next43-assets-navigation.projectFilter.allProjects")}
          icon={<FilterAltOffIcon />}
          checkable="radio"
          checked={scopeKey === ALL_PROJECTS}
          onClick={() => choose(ALL_PROJECTS)}
          dividerAfter
        />
        <MenuItemPrimitive
          label={t("i18n-next43-assets-navigation.projectFilter.personal")}
          icon={projectGlyph}
          checkable="radio"
          checked={isPersonalScope}
          onClick={() => choose(personalProjectId)}
        />
        {namedProjects.map((project) => (
          <MenuItemPrimitive
            key={project.id}
            label={project.name}
            icon={projectGlyph}
            checkable="radio"
            checked={scopeKey === project.id}
            onClick={() => choose(project.id)}
          />
        ))}
        {isPending && (
          <LoadingSpinner
            size="small"
            text={t("i18n-next43-assets-navigation.projectFilter.loading")}
          />
        )}
        {error && (
          <ErrorBanner
            sx={{ mx: SPACING.sm, my: SPACING.xs }}
            report={{
              source: "operation-failure",
              summary: t(
                "i18n-next43-assets-navigation.projectFilter.loadErrorSummary"
              ),
              errorText: error.message
            }}
          >
            {t("i18n-next43-assets-navigation.projectFilter.loadError")}
          </ErrorBanner>
        )}
      </ContextMenu>
    </>
  );
};

export default AssetProjectFilter;
