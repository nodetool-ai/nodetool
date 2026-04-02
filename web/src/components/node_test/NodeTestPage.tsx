import React, { useMemo, useCallback, useRef, useState } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Chip,
  ToggleButtonGroup,
  ToggleButton
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  VariableSizeList as VirtualList,
  ListChildComponentProps
} from "react-window";
import useMetadataStore from "../../stores/MetadataStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodeTestRunner } from "./useNodeTestRunner";
import { NodeTestRow } from "./NodeTestRow";

type FlatRow =
  | { type: "namespace"; namespace: string; nodeCount: number }
  | { type: "node"; metadata: NodeMetadata; nodeType: string };

const NAMESPACE_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 48;

type StatusFilter = "all" | "passed" | "failed" | "idle";

function NodeTestPage() {
  const metadata = useMetadataStore((s) => s.metadata);
  const {
    results,
    concurrency,
    setConcurrency,
    runNodes,
    stopAll,
    clearResults
  } = useNodeTestRunner();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const listRef = useRef<VirtualList>(null);

  const flatRows = useMemo(() => {
    const allNodes = Object.values(metadata);
    const filtered = allNodes.filter((m) => {
      if (m.node_type.startsWith("comfy.")) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !m.node_type.toLowerCase().includes(q) &&
          !m.title.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter !== "all") {
        const r = results.get(m.node_type);
        const status = r?.status || "idle";
        if (statusFilter === "passed" && status !== "passed") return false;
        if (statusFilter === "failed" && status !== "failed") return false;
        if (statusFilter === "idle" && status !== "idle") return false;
      }
      return true;
    });

    const groups = new Map<string, NodeMetadata[]>();
    for (const m of filtered) {
      const ns = m.namespace || "other";
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns)!.push(m);
    }

    const rows: FlatRow[] = [];
    const sortedNamespaces = Array.from(groups.keys()).sort();
    for (const ns of sortedNamespaces) {
      const nodes = groups.get(ns)!;
      rows.push({ type: "namespace", namespace: ns, nodeCount: nodes.length });
      for (const m of nodes.sort((a, b) =>
        a.node_type.localeCompare(b.node_type)
      )) {
        rows.push({ type: "node", metadata: m, nodeType: m.node_type });
      }
    }
    return rows;
  }, [metadata, search, statusFilter, results]);

  const allNodeMetadata = useMemo(
    () =>
      flatRows
        .filter(
          (r): r is Extract<FlatRow, { type: "node" }> => r.type === "node"
        )
        .map((r) => r.metadata),
    [flatRows]
  );

  const handleRunAll = useCallback(() => {
    runNodes(allNodeMetadata);
  }, [runNodes, allNodeMetadata]);

  const handleRunNamespace = useCallback(
    (namespace: string) => {
      const nodes = allNodeMetadata.filter((m) => m.namespace === namespace);
      runNodes(nodes);
    },
    [runNodes, allNodeMetadata]
  );

  const handleRunSingle = useCallback(
    (m: NodeMetadata) => {
      runNodes([m]);
    },
    [runNodes]
  );

  const stats = useMemo(() => {
    let passed = 0,
      failed = 0,
      running = 0,
      queued = 0;
    for (const [, r] of results) {
      if (r.status === "passed") passed++;
      if (r.status === "failed") failed++;
      if (r.status === "running") running++;
      if (r.status === "queued") queued++;
    }
    return { passed, failed, running, queued, total: allNodeMetadata.length };
  }, [results, allNodeMetadata]);

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = flatRows[index];
      if (row.type === "namespace") {
        return (
          <Box
            key={row.namespace}
            style={style}
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1,
              gap: 1,
              bgcolor: "background.paper",
              borderBottom: "1px solid",
              borderColor: "divider"
            }}
          >
            <IconButton
              size="small"
              onClick={() => handleRunNamespace(row.namespace)}
              title={`Run all ${row.nodeCount} nodes in ${row.namespace}`}
            >
              <PlayArrowIcon fontSize="small" />
            </IconButton>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {row.namespace}
            </Typography>
            <Chip label={row.nodeCount} size="small" />
          </Box>
        );
      }

      return (
        <NodeTestRow
          key={row.nodeType}
          metadata={row.metadata}
          result={results.get(row.nodeType)}
          onRun={handleRunSingle}
          style={style}
        />
      );
    },
    [flatRows, results, handleRunSingle, handleRunNamespace]
  );

  const getItemSize = useCallback(
    (index: number) => {
      return flatRows[index].type === "namespace"
        ? NAMESPACE_ROW_HEIGHT
        : NODE_ROW_HEIGHT;
    },
    [flatRows]
  );

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexWrap: "wrap"
        }}
      >
        <Typography variant="h5">Node Integration Tests</Typography>

        <TextField
          size="small"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 250 }}
        />

        <TextField
          size="small"
          type="number"
          label="Concurrency"
          value={concurrency}
          onChange={(e) =>
            setConcurrency(Math.max(1, Number(e.target.value) || 1))
          }
          sx={{ width: 100 }}
          inputProps={{ min: 1, max: 50 }}
        />

        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleRunAll}
          size="small"
        >
          Run All ({stats.total})
        </Button>

        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          onClick={stopAll}
          size="small"
          color="warning"
        >
          Stop All
        </Button>

        <Button size="small" onClick={clearResults}>
          Clear
        </Button>

        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="passed">Passed ({stats.passed})</ToggleButton>
          <ToggleButton value="failed">Failed ({stats.failed})</ToggleButton>
          <ToggleButton value="idle">Pending</ToggleButton>
        </ToggleButtonGroup>

        {stats.running > 0 && (
          <Chip
            label={`Running: ${stats.running}`}
            color="warning"
            size="small"
          />
        )}
        {stats.queued > 0 && (
          <Chip label={`Queued: ${stats.queued}`} color="info" size="small" />
        )}
      </Box>

      <Box sx={{ flex: 1 }}>
        <AutoSizer>
          {({ height, width }) => (
            <VirtualList
              ref={listRef}
              height={height}
              width={width}
              itemCount={flatRows.length}
              itemSize={getItemSize}
            >
              {renderRow}
            </VirtualList>
          )}
        </AutoSizer>
      </Box>
    </Box>
  );
}

export default NodeTestPage;
