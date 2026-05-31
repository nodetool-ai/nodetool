import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import GridViewIcon from "@mui/icons-material/GridView";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import FilterListIcon from "@mui/icons-material/FilterList";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NorthIcon from "@mui/icons-material/North";

import {
  Box,
  FlexRow,
  FlexColumn,
  Text,
  ToggleGroup,
  ToggleOption,
  SearchInput,
  Checkbox,
  Popover
} from "../ui_primitives";
import { CostStatCard } from "./CostStatCard";
import { SpendOverTimeChart } from "./SpendOverTimeChart";
import { CostsTable } from "./CostsTable";
import {
  PROVIDERS,
  WORKFLOWS,
  daysForRange,
  executionsForRange,
  groupExecutions,
  executionsToCsv,
  formatMoney,
  formatPercent,
  formatRangeLabel,
  splitMoney,
  providerColor,
  PROVIDER_BY_ID,
  grandTotal,
  executionCount,
  failedCount,
  avgPerExecution,
  topCostDriver,
  spendDelta,
  type DateRange,
  type GroupByKey,
  type ProviderId,
  type Execution
} from "./costsData";

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
  borderRadius: "10px",
  padding: "3px",
  gap: "2px",
  "& .MuiToggleButton-root": {
    border: "none",
    borderRadius: "7px !important",
    color: theme.vars.palette.text.secondary,
    textTransform: "none",
    fontSize: "13px",
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
  const providerLabel = PROVIDER_BY_ID[e.providerId].label.toLowerCase();
  switch (groupBy) {
    case "nodeType":
      return e.title.toLowerCase().includes(needle);
    case "workflow":
      return e.workflow.toLowerCase().includes(needle);
    case "provider":
      return providerLabel.includes(needle);
    case "model":
      return e.model.toLowerCase().includes(needle);
    default:
      return [e.title, e.workflow, e.model, e.id, providerLabel]
        .join(" ")
        .toLowerCase()
        .includes(needle);
  }
};

const CostsDashboard: React.FC = () => {
  const theme = useTheme();

  const [range, setRange] = useState<DateRange>("14d");
  const [groupBy, setGroupBy] = useState<GroupByKey>("execution");
  const [search, setSearch] = useState("");
  const [providerSel, setProviderSel] = useState<Set<ProviderId>>(
    () => new Set(PROVIDERS.map((p) => p.id))
  );
  const [workflowSel, setWorkflowSel] = useState<Set<string>>(
    () => new Set(WORKFLOWS)
  );

  const days = useMemo(() => daysForRange(range), [range]);
  const rangeLabel = useMemo(
    () =>
      days.length
        ? formatRangeLabel(days[0].date, days[days.length - 1].date)
        : "",
    [days]
  );

  const providersAllSelected = providerSel.size === PROVIDERS.length;
  const workflowsAllSelected = workflowSel.size === WORKFLOWS.length;

  // Range + provider + workflow filters (everything except the text search).
  const scopedExecs = useMemo(
    () =>
      executionsForRange(range).filter(
        (e) => providerSel.has(e.providerId) && workflowSel.has(e.workflow)
      ),
    [range, providerSel, workflowSel]
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

  const driverShare = topCostDriver.cost / grandTotal;
  const total = splitMoney(grandTotal);

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      <Box sx={{ maxWidth: 1480, margin: "0 auto", padding: "24px 40px 72px" }}>
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
            <Text size="normal" color="secondary">
              Spend per node execution across{" "}
              <Text
                component="span"
                weight={600}
                sx={{ color: theme.vars.palette.text.primary }}
              >
                {WORKFLOWS.length} workflows
              </Text>{" "}
              · {rangeLabel}
            </Text>
          </FlexColumn>

          <FlexRow gap={1.5} align="center" wrap sx={{ rowGap: 1 }}>
            <ToggleGroup
              exclusive
              value={range}
              onChange={(_, v) => v && setRange(v as DateRange)}
              sx={segmentedSx(theme)}
            >
              {RANGE_OPTIONS.map((r) => (
                <ToggleOption key={r} value={r}>
                  {r}
                </ToggleOption>
              ))}
            </ToggleGroup>

            <FilterDropdown
              icon={<FilterListIcon sx={{ fontSize: 16 }} />}
              label={providersAllSelected ? "All providers" : "Providers"}
              count={
                providersAllSelected
                  ? String(PROVIDERS.length)
                  : `${providerSel.size}/${PROVIDERS.length}`
              }
              options={PROVIDERS.map((p) => ({
                key: p.id,
                label: p.label,
                color: p.color
              }))}
              selected={providerSel as Set<string>}
              onToggle={(key) =>
                setProviderSel((prev) => toggleSet(prev, key as ProviderId))
              }
              onSelectAll={() =>
                setProviderSel(new Set(PROVIDERS.map((p) => p.id)))
              }
              onClear={() => setProviderSel(new Set())}
            />

            <FilterDropdown
              icon={<AccountTreeIcon sx={{ fontSize: 15 }} />}
              label={workflowsAllSelected ? "All workflows" : "Workflows"}
              count={
                workflowsAllSelected
                  ? undefined
                  : `${workflowSel.size}/${WORKFLOWS.length}`
              }
              options={WORKFLOWS.map((w) => ({ key: w, label: w }))}
              selected={workflowSel}
              onToggle={(key) => setWorkflowSel((prev) => toggleSet(prev, key))}
              onSelectAll={() => setWorkflowSel(new Set(WORKFLOWS))}
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
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "13px",
                fontWeight: 600,
                color: theme.vars.palette.primary.contrastText,
                backgroundColor: theme.vars.palette.primary.main,
                transition: "background-color 120ms ease",
                "&:hover": {
                  backgroundColor: theme.vars.palette.primary.dark
                }
              }}
            >
              <FileDownloadIcon sx={{ fontSize: 17 }} />
              Export CSV
            </Box>
          </FlexRow>
        </FlexRow>

        {/* stat cards */}
        <FlexRow gap={2} wrap sx={{ mb: 3 }}>
          <CostStatCard
            label="Total spend"
            icon={AttachMoneyIcon}
            value={total.whole}
            decimal={total.decimal}
            caption={`vs prior ${range}`}
            badge={
              <FlexRow
                gap={0.25}
                align="center"
                sx={{
                  padding: "1px 6px",
                  borderRadius: "6px",
                  backgroundColor: `${theme.vars.palette.error.main}1F`
                }}
              >
                <NorthIcon
                  sx={{
                    fontSize: 12,
                    color: theme.vars.palette.error.main
                  }}
                />
                <Text
                  size="smaller"
                  weight={600}
                  sx={{ color: theme.vars.palette.error.main }}
                >
                  {formatPercent(spendDelta.fraction)}
                </Text>
              </FlexRow>
            }
          />
          <CostStatCard
            label="Node executions"
            icon={GridViewIcon}
            value={String(executionCount)}
            caption={`${failedCount} failed · ${WORKFLOWS.length} workflows`}
          />
          <CostStatCard
            label="Avg / execution"
            icon={ShowChartIcon}
            value={formatMoney(avgPerExecution)}
            caption="across all node types"
          />
          <CostStatCard
            label="Top cost driver"
            icon={BarChartIcon}
            value={topCostDriver.label}
            valueDotColor={providerColor(topCostDriver.providerId)}
            caption={`${formatMoney(topCostDriver.cost)} · ${formatPercent(
              driverShare
            )} of spend`}
          />
        </FlexRow>

        {/* chart */}
        <Box sx={{ mb: 3 }}>
          <SpendOverTimeChart
            days={days}
            activeProviders={providersAllSelected ? undefined : providerSel}
            rangeLabel={`daily · last ${days.length} days`}
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
              sx={segmentedSx(theme)}
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
      </Box>
    </Box>
  );
};

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
          borderRadius: "10px",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 500,
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover,
          border: `1px solid ${theme.vars.palette.divider}`,
          transition: "background-color 120ms ease",
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
            transition: "transform 120ms ease",
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
                <FlexRow gap={0.75} align="center">
                  {o.color && (
                    <Box
                      sx={{
                        width: 9,
                        height: 9,
                        borderRadius: "3px",
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
  fontSize: "12px",
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
