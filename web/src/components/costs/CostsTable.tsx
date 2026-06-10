import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { Box, FlexRow, FlexColumn, Text } from "../ui_primitives";
import { CostNodeIcon } from "./CostNodeIcon";
import {
  groupExecutions,
  providerColor,
  providerLabel,
  formatMoney,
  formatRuntime,
  formatTokens,
  formatWhen,
  formatPercent,
  type Execution,
  type GroupByKey,
  type GroupRow
} from "./costsData";

export interface CostsTableProps {
  executions: Execution[];
  groupBy: GroupByKey;
}

const EXEC_GRID =
  "minmax(180px, 2.2fr) minmax(120px, 1.5fr) minmax(150px, 1.7fr) 86px 74px 72px 132px 92px";
const GROUP_GRID = "minmax(200px, 2fr) 120px minmax(160px, 2fr) 100px";

const HeaderText: React.FC<
  React.PropsWithChildren<{ align?: "left" | "right" }>
> = ({ children, align = "left" }) => {
  const theme = useTheme();
  return (
    <Text
      size="smaller"
      weight={600}
      sx={{
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: theme.vars.palette.text.disabled,
        textAlign: align,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </Text>
  );
};

const ProviderModel: React.FC<{
  providerId: Execution["providerId"];
  model: string;
}> = ({ providerId, model }) => {
  const theme = useTheme();
  return (
    <FlexRow gap={1} align="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 9,
          height: 9,
          borderRadius: "3px",
          flexShrink: 0,
          backgroundColor: providerColor(providerId)
        }}
      />
      <Text size="small" sx={{ color: theme.vars.palette.text.primary }}>
        {providerLabel(providerId)}
      </Text>
      <Text size="smaller" family="secondary" color="secondary" truncate>
        {model}
      </Text>
    </FlexRow>
  );
};

const ExecutionRows: React.FC<{ rows: Execution[] }> = ({ rows }) => {
  const theme = useTheme();
  return (
    <>
      {rows.map((e) => (
        <Box
          key={e.id}
          sx={{
            display: "grid",
            gridTemplateColumns: EXEC_GRID,
            alignItems: "center",
            columnGap: "16px",
            padding: "12px 24px",
            borderTop: `1px solid ${theme.vars.palette.divider}`,
            transition: "background-color 120ms ease",
            "&:hover": { backgroundColor: theme.vars.palette.action.hover }
          }}
        >
          {/* node */}
          <FlexRow gap={1.25} align="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: "8px",
                flexShrink: 0,
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.vars.palette.text.secondary
              }}
            >
              <CostNodeIcon category={e.category} sx={{ fontSize: 16 }} />
            </Box>
            <FlexColumn sx={{ minWidth: 0 }}>
              <Text
                size="small"
                weight={600}
                truncate
                sx={{ color: theme.vars.palette.text.primary }}
              >
                {e.title}
              </Text>
              <Text size="smaller" family="secondary" color="secondary">
                {e.id}
              </Text>
            </FlexColumn>
          </FlexRow>

          {/* workflow */}
          <Text size="small" color="secondary" truncate>
            {e.workflow}
          </Text>

          {/* provider / model */}
          <ProviderModel providerId={e.providerId} model={e.model} />

          {/* tokens */}
          <Text
            size="small"
            family="secondary"
            color="secondary"
            sx={{ textAlign: "right" }}
          >
            {formatTokens(e.tokensIn)} / {formatTokens(e.tokensOut)}
          </Text>

          {/* runtime */}
          <Text
            size="small"
            family="secondary"
            sx={{
              textAlign: "right",
              color: theme.vars.palette.text.primary
            }}
          >
            {formatRuntime(e.runtimeSec)}
          </Text>

          {/* status */}
          <FlexRow gap={1} align="center">
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor:
                  e.status === "ok"
                    ? theme.vars.palette.success.main
                    : theme.vars.palette.error.main
              }}
            />
            <Text
              size="smaller"
              sx={{
                color:
                  e.status === "ok"
                    ? theme.vars.palette.text.secondary
                    : theme.vars.palette.error.main
              }}
            >
              {e.status}
            </Text>
          </FlexRow>

          {/* when */}
          <Text
            size="smaller"
            family="secondary"
            color="secondary"
            sx={{ textAlign: "right", whiteSpace: "nowrap" }}
          >
            {formatWhen(e.timestamp)}
          </Text>

          {/* cost */}
          <Text
            size="small"
            family="secondary"
            weight={500}
            sx={{
              textAlign: "right",
              color: theme.vars.palette.text.primary
            }}
          >
            {formatMoney(e.cost)}
          </Text>
        </Box>
      ))}
    </>
  );
};

const GroupRows: React.FC<{ rows: GroupRow[]; groupBy: GroupByKey }> = ({
  rows,
  groupBy
}) => {
  const theme = useTheme();
  return (
    <>
      {rows.map((r) => (
        <Box
          key={r.key}
          sx={{
            display: "grid",
            gridTemplateColumns: GROUP_GRID,
            alignItems: "center",
            columnGap: "16px",
            padding: "12px 24px",
            borderTop: `1px solid ${theme.vars.palette.divider}`,
            transition: "background-color 120ms ease",
            "&:hover": { backgroundColor: theme.vars.palette.action.hover }
          }}
        >
          {/* name */}
          <FlexRow gap={1} align="center" sx={{ minWidth: 0 }}>
            {r.providerId && (
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "3px",
                  flexShrink: 0,
                  backgroundColor: providerColor(r.providerId)
                }}
              />
            )}
            <Text
              size="small"
              weight={600}
              truncate
              family={groupBy === "model" ? "secondary" : "primary"}
              sx={{ color: theme.vars.palette.text.primary }}
            >
              {r.name}
            </Text>
          </FlexRow>

          {/* executions */}
          <Text
            size="small"
            family="secondary"
            color="secondary"
            sx={{ textAlign: "right" }}
          >
            {r.executions}
          </Text>

          {/* share bar */}
          <FlexRow gap={1} align="center">
            <Box
              sx={{
                flex: 1,
                height: 6,
                borderRadius: "3px",
                backgroundColor: theme.vars.palette.action.hover,
                overflow: "hidden"
              }}
            >
              <Box
                sx={{
                  width: `${Math.max(r.share * 100, 1.5)}%`,
                  height: "100%",
                  borderRadius: "3px",
                  backgroundColor: r.providerId
                    ? providerColor(r.providerId)
                    : theme.vars.palette.primary.main
                }}
              />
            </Box>
            <Text
              size="smaller"
              family="secondary"
              color="secondary"
              sx={{ width: 38, textAlign: "right" }}
            >
              {formatPercent(r.share)}
            </Text>
          </FlexRow>

          {/* cost */}
          <Text
            size="small"
            family="secondary"
            weight={500}
            sx={{
              textAlign: "right",
              color: theme.vars.palette.text.primary
            }}
          >
            {formatMoney(r.cost)}
          </Text>
        </Box>
      ))}
    </>
  );
};

const CostsTableInternal: React.FC<CostsTableProps> = ({
  executions,
  groupBy
}) => {
  const theme = useTheme();
  const isExecution = groupBy === "execution";

  const headerSx = {
    display: "grid",
    gridTemplateColumns: isExecution ? EXEC_GRID : GROUP_GRID,
    alignItems: "center",
    columnGap: "16px",
    padding: "10px 24px"
  } as const;

  return (
    <Box
      sx={{
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: "12px",
        overflow: "hidden"
      }}
    >
      <Box sx={headerSx}>
        {isExecution ? (
          <>
            <HeaderText>Node</HeaderText>
            <HeaderText>Workflow</HeaderText>
            <HeaderText>Provider / Model</HeaderText>
            <HeaderText align="right">Tokens (in/out)</HeaderText>
            <HeaderText align="right">Runtime</HeaderText>
            <HeaderText>Status</HeaderText>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "2px"
              }}
            >
              <HeaderText align="right">When</HeaderText>
              <ArrowDropDownIcon
                sx={{
                  fontSize: 16,
                  color: theme.vars.palette.text.secondary
                }}
              />
            </Box>
            <HeaderText align="right">Cost</HeaderText>
          </>
        ) : (
          <>
            <HeaderText>
              {groupBy === "nodeType"
                ? "Node type"
                : groupBy === "workflow"
                  ? "Workflow"
                  : groupBy === "provider"
                    ? "Provider"
                    : "Model"}
            </HeaderText>
            <HeaderText align="right">Executions</HeaderText>
            <HeaderText>Share of spend</HeaderText>
            <HeaderText align="right">Cost</HeaderText>
          </>
        )}
      </Box>

      {isExecution ? (
        <ExecutionRows rows={executions} />
      ) : (
        <GroupRows
          rows={groupExecutions(executions, groupBy)}
          groupBy={groupBy}
        />
      )}

      {executions.length === 0 && (
        <Box sx={{ padding: "32px 24px", textAlign: "center" }}>
          <Text size="small" color="secondary">
            No executions match the current filters.
          </Text>
        </Box>
      )}
    </Box>
  );
};

export const CostsTable = memo(CostsTableInternal);
CostsTable.displayName = "CostsTable";

export default CostsTable;
