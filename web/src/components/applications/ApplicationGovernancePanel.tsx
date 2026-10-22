/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { appDeploymentPath } from "@nodetool-ai/protocol";

import type { RouterInputs, RouterOutputs } from "../../trpc/client";
import {
  useApplicationBudget,
  useApplicationDeployment,
  useDeployApplication,
  useUndeployApplication,
  isProductionOnlyDeploymentError,
  useApplicationInvocations,
  useApplicationUsage,
  useApplicationVersions,
  usePublishApplication,
  useReleaseApplicationVersion,
  useReleasedApplicationVersion,
  useSetApplicationBudget
} from "../../hooks/useApplications";
import {
  AlertBanner,
  Button,
  Caption,
  Chip,
  CopyButton,
  Divider,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SectionHeader,
  SelectField,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

type Version = RouterOutputs["applications"]["versions"][number];
type BudgetPeriod = RouterOutputs["applications"]["setBudget"]["period"];

const PERIOD_OPTIONS = [
  { value: "day" },
  { value: "month" },
  { value: "total" }
] as const;

const isBudgetPeriod = (value: string): value is BudgetPeriod =>
  PERIOD_OPTIONS.some((option) => option.value === value);

const formatUsd = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(value);

const formatDate = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));

type ParsedLimit = { ok: true; value: number | null } | { ok: false };

/** Empty means no ceiling; anything else must be a non-negative number. */
const parseLimit = (raw: string): ParsedLimit => {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0
    ? { ok: true, value }
    : { ok: false };
};

/** "2 workflows · asset (read, create)" — what a release is allowed to touch. */
const capabilitySummary = (
  version: Version,
  workflowCount: (count: number) => string
): string => {
  const workflows = version.capabilities.workflows.length;
  const parts = [
    workflowCount(workflows),
    ...version.capabilities.resources.map(
      (resource) => `${resource.kind} (${resource.operations.join(", ")})`
    )
  ];
  return parts.join(" · ");
};

interface VersionRowProps {
  version: Version;
  onRelease: (version: number) => void;
  releasing: boolean;
}

const VersionRow = memo(function VersionRow({
  version,
  onRelease,
  releasing
}: VersionRowProps) {
  const { t, i18n } = useTranslation();
  const handleRelease = useCallback(
    () => onRelease(version.version),
    [onRelease, version.version]
  );
  return (
    <FlexRow align="center" justify="space-between" gap={SPACING.md} fullWidth>
      <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <FlexRow align="center" gap={SPACING.xs}>
          <Text size="small" weight={500}>
            {t("i18n-cont-appbuilder-10.governance.version", {
              version: version.version
            })}
          </Text>
          {version.released && (
            <Chip
              label={t("i18n-cont-appbuilder-10.governance.released")}
              size="small"
            />
          )}
        </FlexRow>
        <Caption>
          {capabilitySummary(version, (count) =>
            t("i18n-cont-appbuilder-10.governance.workflowCount", { count })
          )}
        </Caption>
        <Caption>{formatDate(version.createdAt, i18n.language)}</Caption>
      </FlexColumn>
      {!version.released && (
        <Button
          size="small"
          variant="outlined"
          disabled={releasing}
          onClick={handleRelease}
        >
          {t("i18n-cont-appbuilder-10.governance.rollback", {
            version: version.version
          })}
        </Button>
      )}
    </FlexRow>
  );
});

interface BudgetSectionProps {
  applicationId: string;
}

const BudgetSection = memo(function BudgetSection({
  applicationId
}: BudgetSectionProps) {
  const { t, i18n } = useTranslation();
  const {
    data: budget,
    isLoading,
    isError,
    error
  } = useApplicationBudget(applicationId);
  const { data: usage } = useApplicationUsage(applicationId);
  const setBudget = useSetApplicationBudget();

  const [period, setPeriod] = useState<BudgetPeriod>("month");
  const [maxUsd, setMaxUsd] = useState("");
  const [maxInvocations, setMaxInvocations] = useState("");

  // Seed the form from the stored budget once it arrives (and whenever the
  // app changes), so the fields show what is actually in force.
  useEffect(() => {
    setPeriod(budget?.period ?? "month");
    setMaxUsd(budget?.maxUsd == null ? "" : String(budget.maxUsd));
    setMaxInvocations(
      budget?.maxInvocations == null ? "" : String(budget.maxInvocations)
    );
  }, [budget]);

  const handlePeriodChange = useCallback((value: string) => {
    if (isBudgetPeriod(value)) setPeriod(value);
  }, []);

  const parsedUsd = parseLimit(maxUsd);
  const parsedInvocations = parseLimit(maxInvocations);
  const canSave = parsedUsd.ok && parsedInvocations.ok;

  const handleSave = useCallback(() => {
    const usd = parseLimit(maxUsd);
    const invocations = parseLimit(maxInvocations);
    if (!usd.ok || !invocations.ok) return;
    setBudget.mutate({
      id: applicationId,
      period,
      maxUsd: usd.value,
      maxInvocations: invocations.value
    });
  }, [applicationId, maxInvocations, maxUsd, period, setBudget]);

  if (isLoading)
    return (
      <LoadingSpinner
        text={t("i18n-cont-appbuilder-10.governance.loadingBudget")}
      />
    );

  if (isError) {
    return (
      <AlertBanner severity="error">
        {t("i18n-cont-appbuilder-10.governance.loadBudgetError", {
          error:
            error?.message ?? t("i18n-cont-appbuilder-10.common.tryAgainLater")
        })}
      </AlertBanner>
    );
  }

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader
        title={t("i18n-cont-appbuilder-10.governance.spendBudget")}
      />
      <Caption>
        {t("i18n-cont-appbuilder-10.governance.budgetDescription")}
      </Caption>
      <SelectField
        label={t("i18n-cont-appbuilder-10.governance.period")}
        value={period}
        onChange={handlePeriodChange}
        options={PERIOD_OPTIONS.map((option) => ({
          ...option,
          label: t(`i18n-cont-appbuilder-10.governance.periods.${option.value}`)
        }))}
        size="small"
      />
      <TextInput
        label={t("i18n-cont-appbuilder-10.governance.maxSpend")}
        size="small"
        inputMode="decimal"
        value={maxUsd}
        errorMessage={
          parsedUsd.ok
            ? undefined
            : t("i18n-cont-appbuilder-10.governance.limitHint")
        }
        onChange={(event) => setMaxUsd(event.target.value)}
      />
      <TextInput
        label={t("i18n-cont-appbuilder-10.governance.maxInvocations")}
        size="small"
        inputMode="numeric"
        value={maxInvocations}
        errorMessage={
          parsedInvocations.ok
            ? undefined
            : t("i18n-cont-appbuilder-10.governance.limitHint")
        }
        onChange={(event) => setMaxInvocations(event.target.value)}
      />
      <FlexRow gap={SPACING.md} align="center">
        <Button
          variant="contained"
          size="small"
          disabled={!canSave}
          loading={setBudget.isPending}
          onClick={handleSave}
        >
          {t("i18n-cont-appbuilder-10.governance.saveBudget")}
        </Button>
      </FlexRow>
      {setBudget.isError && (
        <AlertBanner severity="error">
          {t("i18n-cont-appbuilder-10.governance.saveBudgetError", {
            error: setBudget.error.message
          })}
        </AlertBanner>
      )}
      {usage && (
        <Caption>
          {t("i18n-cont-appbuilder-10.governance.usageSummary", {
            amount: formatUsd(usage.spentUsd, i18n.language),
            count: usage.invocations,
            since: usage.since
              ? t("i18n-cont-appbuilder-10.governance.since", {
                  date: formatDate(usage.since, i18n.language)
                })
              : ""
          })}
        </Caption>
      )}
    </FlexColumn>
  );
});

interface DeploySectionProps {
  applicationId: string;
}

/**
 * The hidden link the app is served from, for people with no NodeTool account.
 *
 * Only offered in production — the server refuses the whole surface elsewhere,
 * because a local install already answers without credentials and a "no login
 * needed" link there means nothing. A refused query is therefore the ordinary
 * case on a dev machine, and the section says so instead of showing an error.
 */
const DeploySection = memo(function DeploySection({
  applicationId
}: DeploySectionProps) {
  const { t } = useTranslation();
  const {
    data: deployment,
    isLoading,
    isError,
    error
  } = useApplicationDeployment(applicationId);
  const deploy = useDeployApplication();
  const undeploy = useUndeployApplication();

  const handleDeploy = useCallback(
    () => deploy.mutate({ id: applicationId }),
    [applicationId, deploy]
  );
  const handleUndeploy = useCallback(
    () => undeploy.mutate({ id: applicationId }),
    [applicationId, undeploy]
  );

  const url = deployment
    ? `${window.location.origin}${appDeploymentPath(deployment.token)}`
    : null;

  if (isLoading)
    return (
      <LoadingSpinner
        text={t("i18n-cont-appbuilder-10.governance.loadingLink")}
      />
    );

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader
        title={t("i18n-cont-appbuilder-10.governance.publicLink")}
      />
      {isError && isProductionOnlyDeploymentError(error) ? (
        <Caption>
          {t("i18n-cont-appbuilder-10.governance.publicLinkUnavailable")}
        </Caption>
      ) : isError ? (
        <FlexColumn gap={SPACING.xs}>
          <AlertBanner severity="error">
            {t("i18n-cont-appbuilder-10.governance.loadLinkError", {
              error:
                error?.message ??
                t("i18n-cont-appbuilder-10.common.tryAgainLater")
            })}
          </AlertBanner>
          <ReportBugButton
            label={t(
              "i18n-cont-appbuilder-10.governance.reportDeploymentIssue"
            )}
            context={{
              source: "panel-crash",
              summary: t("i18n-cont-appbuilder-10.governance.linkStatusFailed"),
              errorText: error?.message,
              stackTrace: error instanceof Error ? error.stack : undefined
            }}
          />
        </FlexColumn>
      ) : (
        <>
          <Caption>
            {t("i18n-cont-appbuilder-10.governance.publicLinkDescription")}
          </Caption>
          {url && (
            <FlexRow align="center" gap={SPACING.md} fullWidth>
              <TextInput
                label={t("i18n-cont-appbuilder-10.governance.link")}
                size="small"
                value={url}
                slotProps={{ htmlInput: { readOnly: true } }}
                fullWidth
              />
              <CopyButton
                value={url}
                tooltip={t("i18n-cont-appbuilder-10.governance.copyLink")}
              />
            </FlexRow>
          )}
          {deployment?.blockedReason && (
            <AlertBanner severity="warning">
              {t("i18n-cont-appbuilder-10.governance.linkBlocked", {
                reason: deployment.blockedReason
              })}
            </AlertBanner>
          )}
          <FlexRow gap={SPACING.md} align="center">
            {deployment ? (
              <Button
                variant="outlined"
                size="small"
                loading={undeploy.isPending}
                onClick={handleUndeploy}
              >
                {t("i18n-cont-appbuilder-10.governance.withdrawLink")}
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                loading={deploy.isPending}
                onClick={handleDeploy}
              >
                {t("i18n-cont-appbuilder-10.governance.createPublicLink")}
              </Button>
            )}
          </FlexRow>
          {deploy.isError && (
            <FlexColumn gap={SPACING.xs}>
              <AlertBanner severity="error">
                {t("i18n-cont-appbuilder-10.governance.createLinkError", {
                  error: deploy.error.message
                })}
              </AlertBanner>
              <ReportBugButton
                label={t(
                  "i18n-cont-appbuilder-10.governance.reportDeploymentIssue"
                )}
                context={{
                  source: "panel-crash",
                  summary: t(
                    "i18n-cont-appbuilder-10.governance.linkCreationFailed"
                  ),
                  errorText: deploy.error.message,
                  stackTrace:
                    deploy.error instanceof Error
                      ? deploy.error.stack
                      : undefined
                }}
              />
            </FlexColumn>
          )}
          {undeploy.isError && (
            <FlexColumn gap={SPACING.xs}>
              <AlertBanner severity="error">
                {t("i18n-cont-appbuilder-10.governance.withdrawLinkError", {
                  error: undeploy.error.message
                })}
              </AlertBanner>
              <ReportBugButton
                label={t(
                  "i18n-cont-appbuilder-10.governance.reportDeploymentIssue"
                )}
                context={{
                  source: "panel-crash",
                  summary: t(
                    "i18n-cont-appbuilder-10.governance.linkWithdrawalFailed"
                  ),
                  errorText: undeploy.error.message,
                  stackTrace:
                    undeploy.error instanceof Error
                      ? undeploy.error.stack
                      : undefined
                }}
              />
            </FlexColumn>
          )}
        </>
      )}
    </FlexColumn>
  );
});

interface InvocationsSectionProps {
  applicationId: string;
}

const InvocationsSection = memo(function InvocationsSection({
  applicationId
}: InvocationsSectionProps) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } =
    useApplicationInvocations(applicationId);

  if (isLoading)
    return (
      <LoadingSpinner
        text={t("i18n-cont-appbuilder-10.governance.loadingInvocations")}
      />
    );

  if (isError) {
    return (
      <AlertBanner severity="error">
        {t("i18n-cont-appbuilder-10.governance.loadInvocationsError", {
          error:
            error?.message ?? t("i18n-cont-appbuilder-10.common.tryAgainLater")
        })}
      </AlertBanner>
    );
  }

  const invocations = data ?? [];

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader
        title={t("i18n-cont-appbuilder-10.governance.recentInvocations")}
      />
      {invocations.length === 0 ? (
        <EmptyState
          title={t("i18n-cont-appbuilder-10.governance.noInvocations")}
          description={t(
            "i18n-cont-appbuilder-10.governance.noInvocationsDescription"
          )}
        />
      ) : (
        <FlexColumn gap={SPACING.sm} fullWidth>
          {invocations.map((record) => (
            <FlexRow
              key={record.id}
              align="center"
              justify="space-between"
              gap={SPACING.md}
              fullWidth
            >
              <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
                <Text size="small" weight={500}>
                  {record.operationId}
                </Text>
                <Caption>
                  {`${formatDate(record.createdAt, i18n.language)} · ${record.status}${
                    record.version === null ? "" : ` · v${record.version}`
                  }`}
                </Caption>
              </FlexColumn>
              <Text>
                {formatUsd(
                  record.actualUsd ?? record.estimatedUsd,
                  i18n.language
                )}
                {record.actualUsd === null
                  ? ` (${t("i18n-cont-appbuilder-10.governance.estimated")})`
                  : ""}
              </Text>
            </FlexRow>
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
});

interface ApplicationGovernancePanelProps {
  applicationId: string;
  beforePublish?: () => Promise<string | void>;
}

/**
 * Publish and governance for one app: cut a version, see what each version is
 * allowed to do, roll the release back, and cap what the released app may
 * spend.
 */
const ApplicationGovernancePanel = ({
  applicationId,
  beforePublish
}: ApplicationGovernancePanelProps) => {
  const { t } = useTranslation();
  const {
    data: versions,
    isLoading,
    isError,
    error
  } = useApplicationVersions(applicationId);
  const { data: released } = useReleasedApplicationVersion(applicationId);
  const publish = usePublishApplication();
  const release = useReleaseApplicationVersion();

  const [savingBeforePublish, setSavingBeforePublish] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handlePublish = useCallback(async () => {
    setSaveError(null);
    setSavingBeforePublish(true);
    try {
      const baseUpdatedAt = await beforePublish?.();
      const input: RouterInputs["applications"]["publish"] = {
        id: applicationId
      };
      if (baseUpdatedAt) {
        input.baseUpdatedAt = baseUpdatedAt;
      }
      publish.mutate(input);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingBeforePublish(false);
    }
  }, [applicationId, beforePublish, publish]);

  const handleRelease = useCallback(
    (version: number) => {
      release.mutate({ id: applicationId, version });
    },
    [applicationId, release]
  );

  const sortedVersions = useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions]
  );

  return (
    <FlexColumn gap={SPACING.lg} fullWidth>
      <FlexRow
        align="center"
        justify="space-between"
        gap={SPACING.md}
        fullWidth
      >
        <FlexColumn gap={SPACING.micro}>
          <SectionHeader
            title={t("i18n-cont-appbuilder-10.governance.release")}
          />
          <Caption>
            {released
              ? t("i18n-cont-appbuilder-10.governance.servingVersion", {
                  version: released.version,
                  capabilities: capabilitySummary(released, (count) =>
                    t("i18n-cont-appbuilder-10.governance.workflowCount", {
                      count
                    })
                  )
                })
              : t("i18n-cont-appbuilder-10.governance.nothingReleased")}
          </Caption>
        </FlexColumn>
        <Button
          variant="contained"
          size="small"
          loading={publish.isPending || savingBeforePublish}
          onClick={handlePublish}
        >
          {t("i18n-cont-appbuilder-10.governance.publishVersion")}
        </Button>
      </FlexRow>
      {saveError && (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "notification",
                summary: t(
                  "i18n-cont-appbuilder-10.governance.saveBeforePublishFailed"
                ),
                errorText: saveError
              }}
            />
          }
        >
          {t("i18n-cont-appbuilder-10.governance.saveBeforePublishError", {
            error: saveError
          })}
        </AlertBanner>
      )}
      {publish.isError && (
        <AlertBanner severity="error">
          {t("i18n-cont-appbuilder-10.governance.publishError", {
            error: publish.error.message
          })}
        </AlertBanner>
      )}
      {release.isError && (
        <AlertBanner severity="error">
          {t("i18n-cont-appbuilder-10.governance.changeReleaseError", {
            error: release.error.message
          })}
        </AlertBanner>
      )}

      <Divider />

      <FlexColumn gap={SPACING.md} fullWidth>
        <SectionHeader
          title={t("i18n-cont-appbuilder-10.governance.versions")}
        />
        {isLoading ? (
          <LoadingSpinner
            text={t("i18n-cont-appbuilder-10.governance.loadingVersions")}
          />
        ) : isError ? (
          <AlertBanner severity="error">
            {t("i18n-cont-appbuilder-10.governance.loadVersionsError", {
              error:
                error?.message ??
                t("i18n-cont-appbuilder-10.common.tryAgainLater")
            })}
          </AlertBanner>
        ) : sortedVersions.length === 0 ? (
          <EmptyState
            title={t("i18n-cont-appbuilder-10.governance.noVersions")}
            description={t(
              "i18n-cont-appbuilder-10.governance.noVersionsDescription"
            )}
          />
        ) : (
          <FlexColumn gap={SPACING.md} fullWidth>
            {sortedVersions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                onRelease={handleRelease}
                releasing={release.isPending}
              />
            ))}
          </FlexColumn>
        )}
      </FlexColumn>

      <Divider />

      <DeploySection applicationId={applicationId} />

      <Divider />

      <BudgetSection applicationId={applicationId} />

      <Divider />

      <InvocationsSection applicationId={applicationId} />
    </FlexColumn>
  );
};

export default memo(ApplicationGovernancePanel);
