/**
 * Shows what an agent does during a run, while it runs: the text it writes and
 * each tool call it makes, with the outcome of the call.
 *
 * Bound to `op:<id>/exec#transcript`. A run that drives a model through a tool
 * loop takes minutes. Without this widget the app shows a progress bar for all
 * of that time and then the result.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  isOperationRunning,
  operationTranscript,
  parseBinding,
  type ActivityEntry
} from "@nodetool-ai/app-runtime";

import {
  Box,
  Caption,
  Collapse,
  FlexColumn,
  FlexRow,
  Label,
  ScrollArea,
  ShimmerText,
  StatusPill,
  Text,
  BORDER_RADIUS,
  FONT_SIZE_MONO,
  MOTION,
  SPACING
} from "../../ui_primitives";
import { getToolIcon } from "../../chat/message/toolCallIcon";
import {
  useAppRuntimeContext,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";
import { MarkdownBlock } from "./widgets";

interface AgentActivityWidgetProps {
  id: string;
  binding?: string;
  label?: string;
  height?: number;
  placeholder?: string;
}

const NO_ENTRIES: ReadonlyArray<ActivityEntry> = [];

/** What the editor shows before any run, so the widget can be laid out. */
const SAMPLE: ReadonlyArray<ActivityEntry> = [
  { kind: "text", text: "Reading the approved storyboard." },
  {
    kind: "tool",
    id: "sample",
    name: "edit_timeline",
    label: "Editing the timeline",
    status: "done",
    result: "Applied 3 edits."
  }
];

const RAIL_WIDTH = 20;
const ROW_HEIGHT = 22;

/** The op names a batch call carries, from its arguments or its result text. */
const opNames = (entry: ToolEntry): string[] => {
  const args = entry.args;
  const fromArgs = Array.isArray(args?.ops)
    ? (args.ops as unknown[]).flatMap((op) =>
        typeof op === "object" && op !== null && typeof (op as { op?: unknown }).op === "string"
          ? [(op as { op: string }).op]
          : []
      )
    : [];
  // A result can be cut short, so read the names out of the text, not by parsing it.
  const names = fromArgs.length
    ? fromArgs
    : Array.from((entry.result ?? "").matchAll(/"op":"([a-z0-9_]+)"/g), (m) => m[1]);
  return names.map((name) => name.replace(/^ui_(timeline_)?/, ""));
};

/** "move_track ×3, add_clip" — the distinct ops of a batch, with repeat counts. */
const opSummary = (names: readonly string[]): string | null => {
  if (names.length === 0) return null;
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts, ([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(", ");
};

const prettyResult = (text: string): string => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

type ToolEntry = Extract<ActivityEntry, { kind: "tool" }>;

/**
 * One tool call, phrased and laid out like the chat's tool-call timeline: a
 * glyph and hairline rail, a one-line sentence, the ops it carried in mono,
 * and the raw result one click away.
 */
const ToolRow: React.FC<{ entry: ToolEntry; connected: boolean }> = ({
  entry,
  connected
}) => {
  const [open, setOpen] = useState(false);
  const Icon = getToolIcon(entry.name);
  const running = entry.status === "running";
  const failed = entry.status === "error";
  const detail = opSummary(opNames(entry));
  const result = entry.result?.trim() ? prettyResult(entry.result) : null;
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((value) => !value);
    }
  }, []);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `${RAIL_WIDTH}px 1fr`,
        columnGap: SPACING.md,
        minWidth: 0
      }}
    >
      <FlexColumn align="center" sx={{ minHeight: ROW_HEIGHT }} aria-hidden>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: RAIL_WIDTH,
            height: ROW_HEIGHT,
            flexShrink: 0,
            color: failed
              ? "error.main"
              : running
                ? "primary.main"
                : "text.disabled",
            "& svg": { fontSize: 16 }
          }}
        >
          <Icon />
        </FlexRow>
        {connected ? (
          <Box sx={{ flex: 1, width: "1px", bgcolor: "divider" }} />
        ) : null}
      </FlexColumn>
      <Box sx={{ minWidth: 0, pb: SPACING.xs }}>
        <FlexRow
          align="center"
          fullWidth
          gap={SPACING.xs}
          role={result ? "button" : undefined}
          tabIndex={result ? 0 : undefined}
          aria-expanded={result ? open : undefined}
          onClick={result ? toggle : undefined}
          onKeyDown={result ? onKeyDown : undefined}
          sx={{
            minHeight: ROW_HEIGHT,
            borderRadius: BORDER_RADIUS.sm,
            px: SPACING.sm,
            ml: -SPACING.sm,
            cursor: result ? "pointer" : "default",
            userSelect: "none",
            "&:hover": result ? { bgcolor: "action.hover" } : undefined,
            "&:hover .chevron, &:focus-visible .chevron": { opacity: 1 }
          }}
        >
          <Text
            component="span"
            size="small"
            truncate
            sx={{ color: running ? "text.primary" : "text.secondary", minWidth: 0 }}
          >
            {running ? <ShimmerText>{entry.label}</ShimmerText> : entry.label}
          </Text>
          {detail ? (
            <Caption
              component="span"
              color="secondary"
              sx={{
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0
              }}
            >
              {detail}
            </Caption>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {failed ? (
            <Caption component="span" sx={{ color: "error.main" }}>
              Failed
            </Caption>
          ) : null}
          {result ? (
            <ExpandMoreIcon
              className="chevron"
              aria-hidden
              sx={{
                fontSize: 16,
                color: "text.disabled",
                flexShrink: 0,
                opacity: open ? 1 : 0,
                transform: open ? "rotate(180deg)" : "none",
                transition: `${MOTION.opacity}, ${MOTION.transform}`
              }}
            />
          ) : null}
        </FlexRow>
        {result ? (
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              component="pre"
              sx={{
                m: 0,
                mt: SPACING.xs,
                mb: SPACING.sm,
                p: SPACING.sm,
                borderRadius: BORDER_RADIUS.md,
                bgcolor: "action.hover",
                color: "text.secondary",
                fontFamily: "monospace",
                fontSize: FONT_SIZE_MONO.caption,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 240,
                overflow: "auto"
              }}
            >
              {result}
            </Box>
          </Collapse>
        ) : null}
      </Box>
    </Box>
  );
};

export const AgentActivityWidget: React.FC<AgentActivityWidgetProps> = (
  props
) => {
  const { designMode } = useAppRuntimeContext();
  const ref = parseBinding(props.binding);
  const operationId = ref?.kind === "execution" ? ref.operationId : null;
  const entries = useRuntimeSelector((state) =>
    operationId ? operationTranscript(state, operationId) : NO_ENTRIES
  );
  const running = useRuntimeSelector((state) =>
    operationId ? isOperationRunning(state, operationId) : false
  );
  const shown = designMode && entries.length === 0 ? SAMPLE : entries;

  // Follow the newest entry while the agent works, the way a log does.
  const scroller = useRef<HTMLDivElement>(null);
  const last = shown[shown.length - 1];
  const lastSize = last?.kind === "text" ? last.text.length : last?.status;
  useEffect(() => {
    const element = scroller.current;
    if (running && element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [running, shown.length, lastSize]);

  if (!designMode && !running && shown.length === 0) {
    return props.placeholder ? (
      <Caption color="secondary">{props.placeholder}</Caption>
    ) : null;
  }
  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      <FlexRow gap={SPACING.sm} align="center" fullWidth>
        {props.label ? <Label>{props.label}</Label> : null}
        {running ? <StatusPill tone="rendering">Working</StatusPill> : null}
      </FlexRow>
      <ScrollArea ref={scroller} thin maxHeight={props.height ?? 360}>
        <FlexColumn gap={SPACING.xs} fullWidth>
          {shown.map((entry, index) =>
            entry.kind === "tool" ? (
              <ToolRow
                key={entry.id}
                entry={entry}
                connected={shown[index + 1]?.kind === "tool"}
              />
            ) : (
              <Box key={`text-${index}`} sx={{ width: "100%" }}>
                <MarkdownBlock text={entry.text} />
              </Box>
            )
          )}
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};
