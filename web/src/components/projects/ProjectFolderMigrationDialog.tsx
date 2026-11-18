import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useConfirmProjectFolderMigration,
  useProjectFolderMigrationPlan,
  type ProjectFolderMigrationPlan
} from "../../hooks/useProjectFolderMigration";
import { useFolderPicker } from "../workspaces/useFolderPicker";
import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  Text
} from "../ui_primitives";

interface ProjectFolderMigrationDialogProps {
  readonly open: boolean;
  /** "Not now": the dialog closes until the next launch. */
  readonly onLater: () => void;
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The counts of the plan that are not zero, as label and number. */
const PlanCounts = ({ plan }: { readonly plan: ProjectFolderMigrationPlan }) => {
  const { t } = useTranslation();
  const rows = [
    { key: "projects", label: t("projectFolder.migration.planProjects"), value: plan.projects },
    { key: "files", label: t("projectFolder.migration.planFiles"), value: plan.assets },
    { key: "workflows", label: t("projectFolder.migration.planWorkflows"), value: plan.workflows },
    { key: "timelines", label: t("projectFolder.migration.planTimelines"), value: plan.timelines }
  ].filter((row) => row.value > 0);
  return (
    <FlexColumn component="dl" gap={SPACING.xs} sx={{ m: 0 }}>
      {rows.map((row) => (
        <FlexRow key={row.key} justify="space-between" gap={SPACING.md}>
          <Text component="dt" size="small">
            {row.label}
          </Text>
          <Text component="dd" size="small" weight={600} sx={{ m: 0 }}>
            {row.value}
          </Text>
        </FlexRow>
      ))}
    </FlexColumn>
  );
};

/** The projects that keep one of several workspaces, with the ones hidden. */
const ExtraWorkspaces = ({ plan }: { readonly plan: ProjectFolderMigrationPlan }) => {
  const { t } = useTranslation();
  if (plan.extra_workspaces.length === 0) {
    return null;
  }
  return (
    <AlertBanner severity="warning" title={t("projectFolder.migration.extraTitle")}>
      <FlexColumn gap={SPACING.sm}>
        <Text size="small">{t("projectFolder.migration.extraBody")}</Text>
        <FlexColumn component="ul" gap={SPACING.xs} sx={{ m: 0, pl: SPACING.lg }}>
          {plan.extra_workspaces.map((entry) => (
            <Text key={entry.project_id} component="li" size="small">
              {t("projectFolder.migration.extraKeeps", {
                project: entry.project_name,
                folder: entry.kept.name || entry.kept.path
              })}
              <FlexColumn component="ul" gap={SPACING.micro} sx={{ m: 0, pl: SPACING.lg }}>
                {entry.hidden.map((hidden) => (
                  <Text
                    key={hidden.id}
                    component="li"
                    size="small"
                    color="secondary"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {t("projectFolder.migration.extraHidden", {
                      folder: hidden.name ? `${hidden.name} (${hidden.path})` : hidden.path
                    })}
                  </Text>
                ))}
              </FlexColumn>
            </Text>
          ))}
        </FlexColumn>
      </FlexColumn>
    </AlertBanner>
  );
};

/**
 * The question asked once after the upgrade to project folders: what will
 * move, where to, and a way to choose another location. Nothing moves until
 * the user confirms. The server checks every step.
 */
const ProjectFolderMigrationDialog = ({
  open,
  onLater
}: ProjectFolderMigrationDialogProps) => {
  const { t } = useTranslation();
  const plan = useProjectFolderMigrationPlan();
  const confirm = useConfirmProjectFolderMigration();
  const { pickFolder, dialog: folderPicker } = useFolderPicker();
  const [location, setLocation] = useState<string | undefined>(undefined);
  const readPlan = plan.mutate;

  // Reading the plan records on the server that it was shown, and checks a
  // location the user chose.
  useEffect(() => {
    if (open) {
      readPlan(location === undefined ? undefined : { location });
    }
  }, [open, location, readPlan]);

  const changeLocation = useCallback(async () => {
    const path = await pickFolder();
    if (path) {
      setLocation(path);
    }
  }, [pickFolder]);

  const handleConfirm = useCallback(() => {
    confirm.mutate(location === undefined ? undefined : { location });
  }, [confirm, location]);

  const data = plan.data;
  const locationError = data?.location.error ?? null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onLater}
        onCancel={onLater}
        title={t("projectFolder.migration.title")}
        onConfirm={handleConfirm}
        confirmText={t("projectFolder.migration.confirm")}
        cancelText={t("projectFolder.migration.later")}
        confirmDisabled={!data || locationError !== null || plan.isPending}
        isLoading={confirm.isPending}
      >
        <FlexColumn gap={SPACING.lg}>
          <Text size="small">{t("projectFolder.migration.intro")}</Text>
          {plan.error ? (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: "Could not load the project folder migration plan",
                errorText: errorText(plan.error)
              }}
              onRetry={() => readPlan(location === undefined ? undefined : { location })}
            >
              {t("projectFolder.migration.planError", { error: errorText(plan.error) })}
            </ErrorBanner>
          ) : null}
          {data ? (
            <>
              <PlanCounts plan={data} />
              <ExtraWorkspaces plan={data} />
              <FlexColumn gap={SPACING.xs}>
                <Label>{t("projectFolder.migration.location")}</Label>
                <FlexRow gap={SPACING.md} align="center" wrap>
                  <Text
                    size="small"
                    family="secondary"
                    sx={{ overflowWrap: "anywhere", flex: 1, minWidth: 0 }}
                  >
                    {data.location.path}
                  </Text>
                  <EditorButton
                    size="small"
                    variant="outlined"
                    onClick={() => void changeLocation()}
                    disabled={confirm.isPending}
                  >
                    {t("projectFolder.migration.changeLocation")}
                  </EditorButton>
                </FlexRow>
              </FlexColumn>
              {locationError ? (
                <AlertBanner severity="error">
                  {t("projectFolder.migration.locationError", { error: locationError })}
                </AlertBanner>
              ) : null}
              {data.location.permission_prompt ? (
                <AlertBanner severity="info">
                  {t("projectFolder.migration.permissionWarning")}
                </AlertBanner>
              ) : null}
            </>
          ) : plan.isPending ? (
            <LoadingSpinner size="small" />
          ) : null}
          <Text size="small" color="secondary">
            {t("projectFolder.migration.safety")}
          </Text>
          {confirm.error ? (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: "Could not start the project folder migration",
                errorText: errorText(confirm.error)
              }}
            >
              {t("projectFolder.migration.confirmError", {
                error: errorText(confirm.error)
              })}
            </ErrorBanner>
          ) : null}
        </FlexColumn>
      </Dialog>
      {folderPicker}
    </>
  );
};

export default ProjectFolderMigrationDialog;
