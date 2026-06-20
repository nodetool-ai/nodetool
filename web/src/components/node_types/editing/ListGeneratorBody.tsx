/** @jsxImportSource @emotion/react */
/**
 * ListGeneratorBody — bespoke body for `nodetool.generators.ListGenerator`.
 *
 * The node streams a list of strings (one `item` per LLM `add_item` call). We
 * render them as a numbered, scrollable list that fills in live as items
 * arrive, with a count + running indicator. The node sets
 * `alwaysEmitOutputUpdates` so its `item` stream reaches the client even when
 * the handle is wired onward.
 *
 * Value resolution mirrors OutputNode: prefer the live output-stream buffer
 * (scoped to the focused job), falling back to the node's settled generation.
 * The buffer interleaves the `item` (string) and `index` (int) handles, so we
 * keep only the string items.
 */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { FlexColumn, FlexRow, LoadingSpinner, BORDER_RADIUS, MOTION, FONT_WEIGHT } from "../../ui_primitives";
import { NodeOutputs } from "../../node/NodeOutputs";
import HandleColumn from "../../node/HandleColumn";
import NodeProgress from "../../node/NodeProgress";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";

import useResultsStore from "../../../stores/ResultsStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useNodeGenerations } from "../../../hooks/nodes/useNodeGenerations";
import { outputOf } from "../../../utils/nodeGenerations";
import { resolveExposedInputNames } from "../../../utils/exposedInputs";
import type { BespokeBodyProps } from "./bespokeRegistry";

export const LIST_GENERATOR_NODE_TYPE = "nodetool.generators.ListGenerator";

/** Pull a display string out of one streamed/settled value, or undefined. */
const pullString = (x: unknown): string | undefined => {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.item === "string") return o.item;
    if (typeof o.output === "string") return o.output;
    if (o.type === "text" && typeof o.data === "string") return o.data;
  }
  return undefined;
};

/** Normalize a node value into the list of item strings (drops index ints). */
const toItems = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(pullString)
      .filter((s): s is string => typeof s === "string");
  }
  const single = pullString(value);
  return single !== undefined ? [single] : [];
};

const styles = (theme: Theme) =>
  css({
    position: "relative",
    minHeight: 0,
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,

    ".list-header": {
      display: "flex",
      alignItems: "center",
      gap: 6,
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmaller
    },
    ".list-scroll": {
      flex: "1 1 auto",
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 4
    },
    ".list-section": {
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden"
    },
    ".list-head": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
      cursor: "pointer",
      userSelect: "none",
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".list-index": {
      flexShrink: 0,
      minWidth: 18,
      height: 18,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: `rgba(var(--palette-primary-mainChannel) / 0.18)`,
      color: theme.vars.palette.primary.main,
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.semibold,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: `0 ${theme.spacing(1.5)}`
    },
    ".list-preview": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary
    },
    ".list-chevron": {
      flexShrink: 0,
      fontSize: 16,
      color: theme.vars.palette.text.secondary,
      transition: MOTION.transform
    },
    ".list-chevron.expanded": {
      transform: "rotate(90deg)"
    },
    ".list-full": {
      padding: "0 8px 8px 32px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary
    },
    ".list-empty": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      color: theme.vars.palette.text.disabled,
      fontSize: theme.fontSizeSmaller,
      padding: 12
    }
  });

const ListGeneratorBodyInner: React.FC<BespokeBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const isRunning = status === "running";

  // Input handles (prompt, etc.) — same set the default node body shows, so
  // edges can still attach and the inspector stays in sync.
  const inputProperties = useMemo(() => {
    const names = new Set(resolveExposedInputNames(nodeMetadata, data));
    return (nodeMetadata.properties ?? []).filter((p) => names.has(p.name));
  }, [nodeMetadata, data]);

  const focusedJob = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const streamBuffer = useResultsStore((s) =>
    focusedJob ? s.getOutputResult(workflowId, focusedJob, id) : undefined
  );
  const { current } = useNodeGenerations(workflowId, id);

  const items = useMemo(() => {
    if (streamBuffer !== undefined) return toItems(streamBuffer);
    // The settled generation carries the full list on the `output` handle
    // (live: stream-end frame; reloaded: persisted JSON generation).
    return current ? toItems(outputOf(current, "output")) : [];
  }, [streamBuffer, current]);

  // Accordion expand state, keyed by item index. Items start collapsed.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(
    () => new Set()
  );
  const toggle = useCallback((index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Auto-scroll to the newest item as the stream grows.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  return (
    <div css={styles(theme)} className="nodrag">
      {inputProperties.length > 0 && (
        <HandleColumn id={id} properties={inputProperties} layout="stacked" />
      )}
      <div className="list-header">
        <FormatListNumberedRoundedIcon sx={{ fontSize: 14 }} />
        <span>
          {items.length === 0
            ? isRunning
              ? "Generating…"
              : "List"
            : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
        {isRunning && <LoadingSpinner inline size={12} color="inherit" />}
      </div>

      {items.length === 0 ? (
        <div className="list-empty">
          {isRunning ? "Generating items…" : "Run to generate a list"}
        </div>
      ) : (
        <div ref={scrollRef} className="list-scroll nowheel">
          {items.map((item, i) => {
            const isOpen = expanded.has(i);
            return (
              <div className="list-section" key={`${i}-${item.slice(0, 24)}`}>
                <div
                  className="list-head"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(i);
                    }
                  }}
                >
                  <span className="list-index">{i + 1}</span>
                  <span className="list-preview">{item}</span>
                  <ChevronRightRoundedIcon
                    className={`list-chevron${isOpen ? " expanded" : ""}`}
                  />
                </div>
                {isOpen && <div className="list-full">{item}</div>}
              </div>
            );
          })}
        </div>
      )}

      {!isOutputNode && (
        <FlexColumn gap={0}>
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </FlexColumn>
      )}
      {isRunning && (
        <FlexRow>
          <NodeProgress id={id} workflowId={workflowId} />
        </FlexRow>
      )}
    </div>
  );
};

export default memo(ListGeneratorBodyInner);
