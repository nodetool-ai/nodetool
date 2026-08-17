/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { RouterOutputs } from "../../trpc/client";
import {
  useApplicationBudget,
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
    <FlexRow align="center" justify="space-between" gap={2} fullWidth>
      <FlexColumn gap={0.5} sx={{ minWidth: 0 }}>
        <FlexRow align="center" gap={1}>
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
      <FlexRow gap={2} align="center">
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
              gap={2}
              fullWidth
            >
              <FlexColumn gap={0.5} sx={{ minWidth: 0 }}>
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
      <FlexRow align="center" justify="space-between" gap={2} fullWidth>
        <FlexColumn gap={0.5}>
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

      <BudgetSection applicationId={applicationId} />

      <Divider />

      <InvocationsSection applicationId={applicationId} />
    </FlexColumn>
  );
};

export default memo(ApplicationGovernancePanel);
