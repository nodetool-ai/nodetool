import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import GridViewIcon from "@mui/icons-material/GridView";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import FilterListIcon from "@mui/icons-material/FilterList";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NorthIcon from "@mui/icons-material/North";
import SouthIcon from "@mui/icons-material/South";

import {
  Box,
  FlexRow,
  FlexColumn,
  Text,
  ToggleGroup,
  ToggleOption,
  SearchInput,
  Checkbox,
  Popover,
  LoadingSpinner,
  MOTION
} from "../ui_primitives";
import { CostStatCard } from "./CostStatCard";
import { SpendOverTimeChart } from "./SpendOverTimeChart";
import { CostsTable } from "./CostsTable";
import {
  groupExecutions,
  executionsToCsv,
  formatMoney,
  formatPercent,
  formatRangeLabel,
  splitMoney,
  providerColor,
  providerLabel,
  type DateRange,
  type GroupByKey,
  type Execution
} from "./costsData";
import { useCostsDashboard } from "./useCostsDashboard";

const RANGE_OPTIONS: DateRange[] = ["7d", "14d", "30d", "90d"];
const GROUP_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: "execution", label: "Execution" },
  { value: "nodeType", label: "Node type" },
  { value: "workflow", label: "Workflow" },
  { value: "provider", label: "Provider" },
  { value: "model", label: "Model" }
];

const segmentedSx = (theme: Theme): SxProps<Theme> => ({
  backgroundColor: theme.vars.palette.action.hover,
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: "var(--rounded-lg)",
  padding: "3px",
  gap: "2px",
  "& .MuiToggleButton-root": {
    border: "none",
    borderRadius: "var(--rounded-md) !important",
    color: theme.vars.palette.text.secondary,
    textTransform: "none",
    fontSize: "var(--fontSizeSmall)",
    fontWeight: 500,
    lineHeight: 1,
    padding: "6px 12px",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.primary
    },
    "&.Mui-selected": {
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.primary,
      boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
      "&:hover": { backgroundColor: theme.vars.palette.background.default }
    }
  }
});

const matchesSearch = (
  e: Execution,
  q: string,
  groupBy: GroupByKey
): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  const provider = providerLabel(e.providerId).toLowerCase();
  switch (groupBy) {
    case "nodeType":
      return e.title.toLowerCase().includes(needle);
    case "workflow":
      return e.workflow.toLowerCase().includes(needle);
    case "provider":
      return provider.includes(needle);
    case "model":
      return e.model.toLowerCase().includes(needle);
    default:
      return [e.title, e.workflow, e.model, e.id, provider]
        .join(" ")
        .toLowerCase()
        .includes(needle);
  }
};

const CostsDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const [range, setRange] = useState<DateRange>("14d");
  const [groupBy, setGroupBy] = useState<GroupByKey>("execution");
  const [search, setSearch] = useState("");
  // null = "all selected" (universe-agnostic); a Set = an explicit subset.
  const [providerSel, setProviderSel] = useState<Set<string> | null>(null);
  const [workflowSel, setWorkflowSel] = useState<Set<string> | null>(null);

  const { view, isLoading, isError } = useCostsDashboard(range);
  const segmentedStyles = useMemo(() => segmentedSx(theme), [theme]);

  const allExecs = useMemo(() => view?.executions ?? [], [view]);
  const providerUniverse = useMemo(
    () => (view?.providers ?? []).map((p) => p.id),
    [view]
  );
  const workflowUniverse = useMemo(
    () => Array.from(new Set(allExecs.map((e) => e.workflow))).sort(),
    [allExecs]
  );

  const providersAllSelected = providerSel === null;
  const workflowsAllSelected = workflowSel === null;

  const rangeLabel = useMemo(() => {
    const days = view?.days ?? [];
    return days.length
      ? formatRangeLabel(days[0].date, days[days.length - 1].date)
      : "";
  }, [view]);

  // Provider + workflow filters (everything except the text search).
  const scopedExecs = useMemo(
    () =>
      allExecs.filter(
        (e) =>
          (providerSel === null || providerSel.has(e.providerId)) &&
          (workflowSel === null || workflowSel.has(e.workflow))
      ),
    [allExecs, providerSel, workflowSel]
  );

  const tableExecs = useMemo(
    () => scopedExecs.filter((e) => matchesSearch(e, search, groupBy)),
    [scopedExecs, search, groupBy]
  );

  // "X of Y" reflects rows in the active grouping mode.
  const { visibleCount, totalCount } = useMemo(() => {
    if (groupBy === "execution") {
      return {
        visibleCount: tableExecs.length,
        totalCount: scopedExecs.length
      };
    }
    return {
      visibleCount: groupExecutions(tableExecs, groupBy).length,
      totalCount: groupExecutions(scopedExecs, groupBy).length
    };
  }, [tableExecs, scopedExecs, groupBy]);

  const providerOptions = useMemo(
    () =>
      (view?.providers ?? []).map((p) => ({
        key: p.id,
        label: p.label,
        color: p.color
      })),
    [view]
  );

  const workflowOptions = useMemo(
    () => workflowUniverse.map((w) => ({ key: w, label: w })),
    [workflowUniverse]
  );

  const handleExport = useCallback(() => {
    const csv = executionsToCsv(tableExecs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nodetool-costs-${range}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [tableExecs, range]);

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      <Box sx={{ maxWidth: 1480, margin: "0 auto", padding: "24px 40px 72px" }}>
        {/* back to editor */}
        <Box
          component="button"
          type="button"
          onClick={() => navigate("/editor")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            mb: 2,
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "var(--fontSizeSmall)",
            fontWeight: 500,
            color: theme.vars.palette.text.secondary,
            transition: `color ${MOTION.fast}`,
            "&:hover": { color: theme.vars.palette.text.primary }
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 16 }} />
          Back to editor
        </Box>

        {/* header */}
        <FlexRow
          justify="space-between"
          align="flex-start"
          wrap
          sx={{ rowGap: 2, mb: 3 }}
        >
          <FlexColumn gap={0.5}>
            <Text
              component="h1"
              sx={{
                fontSize: "1.75rem",
                fontWeight: 700,
                lineHeight: 1.1,
                color: theme.vars.palette.text.primary
              }}
            >
              Costs
            </Text>
            {view ? (
              <Text size="normal" color="secondary">
                Spend per node execution across{" "}
                <Text
                  component="span"
                  weight={600}
                  sx={{ color: theme.vars.palette.text.primary }}
                >
                  {view.stats.workflowCount} workflows
                </Text>{" "}
                · {rangeLabel}
              </Text>
            ) : (
              <Text size="normal" color="secondary">
                Spend per node execution
              </Text>
            )}
          </FlexColumn>

          <FlexRow gap={1.5} align="center" wrap sx={{ rowGap: 1 }}>
            <ToggleGroup
              exclusive
              value={range}
              onChange={(_, v) => v && setRange(v as DateRange)}
              sx={segmentedStyles}
            >
              {RANGE_OPTIONS.map((r) => (
                <ToggleOption key={r} value={r}>
                  {r}
                </ToggleOption>
              ))}
            </ToggleGroup>

            {view && (
              <>
                <FilterDropdown
                  icon={<FilterListIcon sx={{ fontSize: 16 }} />}
                  label={providersAllSelected ? "All providers" : "Providers"}
                  count={
                    providersAllSelected
                      ? String(providerUniverse.length)
                      : `${providerSel.size}/${providerUniverse.length}`
                  }
                  options={providerOptions}
                  selected={providerSel ?? new Set(providerUniverse)}
                  onToggle={(key) =>
                    setProviderSel((prev) => {
                      const next = toggleSet(
                        prev ?? new Set(providerUniverse),
                        key
                      );
                      return next.size === providerUniverse.length
                        ? null
                        : next;
                    })
                  }
                  onSelectAll={() => setProviderSel(null)}
                  onClear={() => setProviderSel(new Set())}
                />

                <FilterDropdown
                  icon={<AccountTreeIcon sx={{ fontSize: 15 }} />}
                  label={workflowsAllSelected ? "All workflows" : "Workflows"}
                  count={
                    workflowsAllSelected
                      ? undefined
                      : `${workflowSel.size}/${workflowUniverse.length}`
                  }
                  options={workflowOptions}
                  selected={workflowSel ?? new Set(workflowUniverse)}
                  onToggle={(key) =>
                    setWorkflowSel((prev) => {
                      const next = toggleSet(
                        prev ?? new Set(workflowUniverse),
                        key
                      );
                      return next.size === workflowUniverse.length
                        ? null
                        : next;
                    })
                  }
                  onSelectAll={() => setWorkflowSel(null)}
                  onClear={() => setWorkflowSel(new Set())}
                />

                <Box
                  component="button"
                  type="button"
                  onClick={handleExport}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    height: 38,
                    padding: "0 16px",
                    borderRadius: "var(--rounded-lg)",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "var(--fontSizeSmall)",
                    fontWeight: 600,
                    color: theme.vars.palette.primary.contrastText,
                    backgroundColor: theme.vars.palette.primary.main,
                    transition: MOTION.background,
                    "&:hover": {
                      backgroundColor: theme.vars.palette.primary.dark
                    }
                  }}
                >
                  <FileDownloadIcon sx={{ fontSize: 17 }} />
                  Export CSV
                </Box>
              </>
            )}
          </FlexRow>
        </FlexRow>

        {isLoading ? (
          <StateMessage>
            <LoadingSpinner />
          </StateMessage>
        ) : isError ? (
          <StateMessage>
            <Text color="secondary">
              Couldn&apos;t load cost data. Please try again.
            </Text>
          </StateMessage>
        ) : view ? (
          <DashboardContent
            view={view}
            range={range}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            search={search}
            setSearch={setSearch}
            providerSel={providerSel}
            tableExecs={tableExecs}
            visibleCount={visibleCount}
            totalCount={totalCount}
          />
        ) : (
          <StateMessage>
            <Text color="secondary">No cost data for this period.</Text>
          </StateMessage>
        )}
      </Box>
    </Box>
  );
};

// --- content (success state) ------------------------------------------------

interface DashboardContentProps {
  view: NonNullable<ReturnType<typeof useCostsDashboard>["view"]>;
  range: DateRange;
  groupBy: GroupByKey;
  setGroupBy: (g: GroupByKey) => void;
  search: string;
  setSearch: (s: string) => void;
  providerSel: Set<string> | null;
  tableExecs: Execution[];
  visibleCount: number;
  totalCount: number;
}

const DashboardContent: React.FC<DashboardContentProps> = ({
  view,
  range,
  groupBy,
  setGroupBy,
  search,
  setSearch,
  providerSel,
  tableExecs,
  visibleCount,
  totalCount
}) => {
  const theme = useTheme();
  const segmentedStyles = useMemo(() => segmentedSx(theme), [theme]);
  const stats = view.stats;
  const total = splitMoney(stats.totalSpend);
  const driver = stats.topDriver;
  const driverShare =
    driver && stats.totalSpend > 0 ? driver.cost / stats.totalSpend : 0;
  const delta = stats.deltaFraction;
  const deltaUp = (delta ?? 0) >= 0;
  const deltaColor = deltaUp
    ? theme.vars.palette.error.main
    : theme.vars.palette.success.main;

  return (
    <>
      {/* stat cards */}
      <FlexRow gap={2} wrap sx={{ mb: 3 }}>
        <CostStatCard
          label="Total spend"
          icon={AttachMoneyIcon}
          value={total.whole}
          decimal={total.decimal}
          caption={`vs prior ${range}`}
          badge={
            delta === null ? undefined : (
              <FlexRow
                gap={0.5}
                align="center"
                sx={{
                  padding: "1px 6px",
                  borderRadius: "6px",
                  backgroundColor: `${deltaColor}1F`
                }}
              >
                {deltaUp ? (
                  <NorthIcon sx={{ fontSize: 12, color: deltaColor }} />
                ) : (
                  <SouthIcon sx={{ fontSize: 12, color: deltaColor }} />
                )}
                <Text size="smaller" weight={600} sx={{ color: deltaColor }}>
                  {formatPercent(Math.abs(delta))}
                </Text>
              </FlexRow>
            )
          }
        />
        <CostStatCard
          label="Node executions"
          icon={GridViewIcon}
          value={String(stats.executionCount)}
          caption={`${stats.failedCount} failed · ${stats.workflowCount} workflows`}
        />
        <CostStatCard
          label="Avg / execution"
          icon={ShowChartIcon}
          value={formatMoney(stats.avgPerExecution)}
          caption="across all node types"
        />
        <CostStatCard
          label="Top cost driver"
          icon={BarChartIcon}
          value={driver ? driver.label : "—"}
          valueVariant="label"
          valueDotColor={driver ? providerColor(driver.providerId) : undefined}
          caption={
            driver
              ? `${formatMoney(driver.cost)} · ${formatPercent(
                  driverShare
                )} of spend`
              : "no spend yet"
          }
        />
      </FlexRow>

      {/* chart */}
      <Box sx={{ mb: 3 }}>
        <SpendOverTimeChart
          days={view.days}
          providers={view.providers}
          stackOrder={view.stackOrder}
          activeProviders={providerSel ?? undefined}
          rangeLabel={`daily · last ${view.days.length} days`}
        />
      </Box>

      {/* group-by + search */}
      <FlexRow
        justify="space-between"
        align="center"
        wrap
        sx={{ rowGap: 1.5, mb: 2 }}
      >
        <FlexRow gap={1.5} align="center">
          <Text
            size="smaller"
            weight={600}
            sx={{
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: theme.vars.palette.text.disabled
            }}
          >
            Group by
          </Text>
          <ToggleGroup
            exclusive
            value={groupBy}
            onChange={(_, v) => v && setGroupBy(v as GroupByKey)}
            sx={segmentedStyles}
          >
            {GROUP_OPTIONS.map((o) => (
              <ToggleOption key={o.value} value={o.value}>
                {o.label}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexRow>

        <FlexRow gap={2} align="center">
          <Box sx={{ width: 240 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Filter nodes, models…"
              fullWidth
            />
          </Box>
          <Text
            size="smaller"
            family="secondary"
            sx={{
              color: theme.vars.palette.text.disabled,
              whiteSpace: "nowrap"
            }}
          >
            {visibleCount} of {totalCount}
          </Text>
        </FlexRow>
      </FlexRow>

      {/* table */}
      <CostsTable executions={tableExecs} groupBy={groupBy} />
    </>
  );
};

const StateMessage: React.FC<React.PropsWithChildren> = ({ children }) => (
  <FlexColumn
    align="center"
    justify="center"
    gap={1.5}
    sx={{ minHeight: 320, width: "100%" }}
  >
    {children}
  </FlexColumn>
);

// --- filter dropdown --------------------------------------------------------

interface FilterOption {
  key: string;
  label: string;
  color?: string;
}

interface FilterDropdownProps {
  icon: React.ReactNode;
  label: string;
  count?: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  icon,
  label,
  count,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear
}) => {
  const theme = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          height: 38,
          padding: "0 12px",
          borderRadius: "var(--rounded-lg)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "var(--fontSizeSmall)",
          fontWeight: 500,
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover,
          border: `1px solid ${theme.vars.palette.divider}`,
          transition: MOTION.background,
          "&:hover": {
            backgroundColor: theme.vars.palette.action.selected
          }
        }}
      >
        <Box
          sx={{
            display: "flex",
            color: theme.vars.palette.text.secondary
          }}
        >
          {icon}
        </Box>
        {label}
        {count && (
          <Text
            size="smaller"
            family="secondary"
            sx={{ color: theme.vars.palette.text.disabled }}
          >
            {count}
          </Text>
        )}
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: theme.vars.palette.text.secondary,
            transition: MOTION.transform,
            transform: open ? "rotate(180deg)" : "none"
          }}
        />
      </Box>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        placement="bottom-left"
        maxWidth={260}
        paperSx={{
          mt: 0.5,
          backgroundColor: theme.vars.palette.background.paper,
          border: `1px solid ${theme.vars.palette.divider}`,
          backgroundImage: "none"
        }}
      >
        <FlexColumn sx={{ padding: "8px", minWidth: 200 }}>
          <FlexRow
            justify="space-between"
            align="center"
            sx={{ px: 1, pb: 0.5 }}
          >
            <Box
              component="button"
              type="button"
              onClick={onSelectAll}
              sx={linkButtonSx(theme)}
            >
              Select all
            </Box>
            <Box
              component="button"
              type="button"
              onClick={onClear}
              sx={linkButtonSx(theme)}
            >
              Clear
            </Box>
          </FlexRow>
          {options.map((o) => (
            <Checkbox
              key={o.key}
              compact
              size="small"
              checked={selected.has(o.key)}
              onChange={() => onToggle(o.key)}
              label={
                <FlexRow gap={1} align="center">
                  {o.color && (
                    <Box
                      sx={{
                        width: 9,
                        height: 9,
                        borderRadius: "var(--rounded-sm)",
                        backgroundColor: o.color
                      }}
                    />
                  )}
                  <Text size="small">{o.label}</Text>
                </FlexRow>
              }
              labelProps={{ sx: { mx: 0, gap: 0.5, py: 0.25 } }}
            />
          ))}
          {options.length === 0 && (
            <Text size="small" color="secondary" sx={{ px: 1, py: 0.5 }}>
              No options
            </Text>
          )}
        </FlexColumn>
      </Popover>
    </>
  );
};

const linkButtonSx = (theme: Theme): SxProps<Theme> => ({
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "var(--fontSizeSmall)",
  fontWeight: 500,
  color: theme.vars.palette.primary.main,
  "&:hover": { textDecoration: "underline" }
});

const toggleSet = <T,>(set: Set<T>, key: T): Set<T> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export default CostsDashboard;
