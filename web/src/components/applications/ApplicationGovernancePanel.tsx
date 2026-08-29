/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { appDeploymentPath } from "@nodetool-ai/protocol";

import type { RouterOutputs } from "../../trpc/client";
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
  { value: "day", label: "Per day" },
  { value: "month", label: "Per month" },
  { value: "total", label: "Lifetime" }
] as const;

const isBudgetPeriod = (value: string): value is BudgetPeriod =>
  PERIOD_OPTIONS.some((option) => option.value === value);

const formatUsd = (value: number): string => `$${value.toFixed(4)}`;

const formatDate = (iso: string): string => new Date(iso).toLocaleString();

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

const LIMIT_HINT = "Enter a number of 0 or more, or leave empty for no limit.";

/** "2 workflows · asset (read, create)" — what a release is allowed to touch. */
const capabilitySummary = (version: Version): string => {
  const workflows = version.capabilities.workflows.length;
  const parts = [
    workflows === 1 ? "1 workflow" : `${workflows} workflows`,
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
  const handleRelease = useCallback(
    () => onRelease(version.version),
    [onRelease, version.version]
  );
  return (
    <FlexRow
      align="center"
      justify="space-between"
      gap={SPACING.md}
      fullWidth
    >
      <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <FlexRow align="center" gap={SPACING.xs}>
          <Text weight={600}>{`Version ${version.version}`}</Text>
          {version.released && <Chip label="Released" size="small" />}
        </FlexRow>
        <Caption>{capabilitySummary(version)}</Caption>
        <Caption>{formatDate(version.createdAt)}</Caption>
      </FlexColumn>
      {!version.released && (
        <Button
          size="small"
          variant="outlined"
          disabled={releasing}
          onClick={handleRelease}
        >
          {`Roll back to version ${version.version}`}
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

  if (isLoading) return <LoadingSpinner text="Loading budget" />;

  if (isError) {
    return (
      <AlertBanner severity="error">
        {`Could not load the budget: ${error?.message ?? "try again later."}`}
      </AlertBanner>
    );
  }

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader title="Spend budget" />
      <Caption>
        Runs of the released app are checked against this ceiling before they
        reach a provider. An empty field means no limit.
      </Caption>
      <SelectField
        label="Period"
        value={period}
        onChange={handlePeriodChange}
        options={PERIOD_OPTIONS}
        size="small"
      />
      <TextInput
        label="Max spend (USD)"
        size="small"
        inputMode="decimal"
        value={maxUsd}
        errorMessage={parsedUsd.ok ? undefined : LIMIT_HINT}
        onChange={(event) => setMaxUsd(event.target.value)}
      />
      <TextInput
        label="Max invocations"
        size="small"
        inputMode="numeric"
        value={maxInvocations}
        errorMessage={parsedInvocations.ok ? undefined : LIMIT_HINT}
        onChange={(event) => setMaxInvocations(event.target.value)}
      />
      <FlexRow gap={SPACING.md} align="center">
        <Button
          variant="contained"
          size="small"
          disabled={setBudget.isPending || !canSave}
          onClick={handleSave}
        >
          Save budget
        </Button>
      </FlexRow>
      {setBudget.isError && (
        <AlertBanner severity="error">
          {`Could not save the budget: ${setBudget.error.message}`}
        </AlertBanner>
      )}
      {usage && (
        <Caption>
          {`Used ${formatUsd(usage.spentUsd)} across ${usage.invocations} run${
            usage.invocations === 1 ? "" : "s"
          }${usage.since ? ` since ${formatDate(usage.since)}` : ""}.`}
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
  const { data: deployment, isLoading, isError, error } =
    useApplicationDeployment(applicationId);
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

  if (isLoading) return <LoadingSpinner text="Loading link" />;

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader title="Public link" />
      {isError && isProductionOnlyDeploymentError(error) ? (
        <Caption>
          Public links are available on nodetool.ai. This server does not serve
          them.
        </Caption>
      ) : isError ? (
        <FlexColumn gap={SPACING.xs}>
          <AlertBanner severity="error">
            {`Could not load the public link: ${error?.message ?? "try again later."}`}
          </AlertBanner>
          <ReportBugButton
            label="Report deployment issue"
            context={{
              source: "panel-crash",
              summary: "Public link status failed to load",
              errorText: error?.message,
              stackTrace: error instanceof Error ? error.stack : undefined
            }}
          />
        </FlexColumn>
      ) : (
        <>
          <Caption>
            Anyone with the link can open and run the released version — no
            account needed. Runs execute on your account and count against the
            spend budget below.
          </Caption>
          {url && (
            <FlexRow align="center" gap={SPACING.md} fullWidth>
              <TextInput
                label="Link"
                size="small"
                value={url}
                slotProps={{ htmlInput: { readOnly: true } }}
                fullWidth
              />
              <CopyButton value={url} tooltip="Copy the link" />
            </FlexRow>
          )}
          {deployment?.blockedReason && (
            <AlertBanner severity="warning">
              {`The link is not serving this app. ${deployment.blockedReason}`}
            </AlertBanner>
          )}
          <FlexRow gap={SPACING.md} align="center">
            {deployment ? (
              <Button
                variant="outlined"
                size="small"
                disabled={undeploy.isPending}
                onClick={handleUndeploy}
              >
                Withdraw link
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                disabled={deploy.isPending}
                onClick={handleDeploy}
              >
                Create public link
              </Button>
            )}
          </FlexRow>
          {deploy.isError && (
            <FlexColumn gap={SPACING.xs}>
              <AlertBanner severity="error">
                {`Could not create the link: ${deploy.error.message}`}
              </AlertBanner>
              <ReportBugButton
                label="Report deployment issue"
                context={{
                  source: "panel-crash",
                  summary: "Public link creation failed",
                  errorText: deploy.error.message,
                  stackTrace:
                    deploy.error instanceof Error ? deploy.error.stack : undefined
                }}
              />
            </FlexColumn>
          )}
          {undeploy.isError && (
            <FlexColumn gap={SPACING.xs}>
              <AlertBanner severity="error">
                {`Could not withdraw the link: ${undeploy.error.message}`}
              </AlertBanner>
              <ReportBugButton
                label="Report deployment issue"
                context={{
                  source: "panel-crash",
                  summary: "Public link withdrawal failed",
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
  const { data, isLoading, isError, error } =
    useApplicationInvocations(applicationId);

  if (isLoading) return <LoadingSpinner text="Loading invocations" />;

  if (isError) {
    return (
      <AlertBanner severity="error">
        {`Could not load invocations: ${error?.message ?? "try again later."}`}
      </AlertBanner>
    );
  }

  const invocations = data ?? [];

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <SectionHeader title="Recent invocations" />
      {invocations.length === 0 ? (
        <EmptyState
          title="No invocations yet"
          description="Runs of the released app show up here with their cost."
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
                <Text weight={600}>{record.operationId}</Text>
                <Caption>
                  {`${formatDate(record.createdAt)} · ${record.status}${
                    record.version === null ? "" : ` · v${record.version}`
                  }`}
                </Caption>
              </FlexColumn>
              <Text>
                {formatUsd(record.actualUsd ?? record.estimatedUsd)}
                {record.actualUsd === null ? " (est.)" : ""}
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
}

/**
 * Publish and governance for one app: cut a version, see what each version is
 * allowed to do, roll the release back, and cap what the released app may
 * spend.
 */
const ApplicationGovernancePanel = ({
  applicationId
}: ApplicationGovernancePanelProps) => {
  const {
    data: versions,
    isLoading,
    isError,
    error
  } = useApplicationVersions(applicationId);
  const { data: released } = useReleasedApplicationVersion(applicationId);
  const publish = usePublishApplication();
  const release = useReleaseApplicationVersion();

  const handlePublish = useCallback(() => {
    publish.mutate({ id: applicationId });
  }, [applicationId, publish]);

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
          <SectionHeader title="Release" />
          <Caption>
            {released
              ? `Serving version ${released.version} — ${capabilitySummary(
                  released
                )}`
              : "Nothing released yet."}
          </Caption>
        </FlexColumn>
        <Button
          variant="contained"
          size="small"
          disabled={publish.isPending}
          onClick={handlePublish}
        >
          Publish new version
        </Button>
      </FlexRow>
      {publish.isError && (
        <AlertBanner severity="error">
          {`Could not publish: ${publish.error.message}`}
        </AlertBanner>
      )}
      {release.isError && (
        <AlertBanner severity="error">
          {`Could not change the release: ${release.error.message}`}
        </AlertBanner>
      )}

      <Divider />

      <FlexColumn gap={SPACING.md} fullWidth>
        <SectionHeader title="Versions" />
        {isLoading ? (
          <LoadingSpinner text="Loading versions" />
        ) : isError ? (
          <AlertBanner severity="error">
            {`Could not load versions: ${error?.message ?? "try again later."}`}
          </AlertBanner>
        ) : sortedVersions.length === 0 ? (
          <EmptyState
            title="No versions yet"
            description="Publish the app to cut its first version."
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
