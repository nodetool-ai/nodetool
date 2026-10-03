/**
 * Shows what an agent does during a run, while it runs: the text it writes and
 * each tool call it makes, with the outcome of the call.
 *
 * Bound to `op:<id>/exec#transcript`. A run that drives a model through a tool
 * loop takes minutes. Without this widget the app shows a progress bar for all
 * of that time and then the result.
 */
import React, { useEffect, useRef } from "react";
import {
  isOperationRunning,
  operationTranscript,
  parseBinding,
  type ActivityEntry
} from "@nodetool-ai/app-runtime";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  Label,
  ScrollArea,
  StatusPill,
  Text,
  BORDER_RADIUS,
  SPACING,
  type StatusPillTone
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

const TOOL_TONE: Record<string, { tone: StatusPillTone; text: string }> = {
  running: { tone: "rendering", text: "Running" },
  done: { tone: "done", text: "Done" },
  error: { tone: "failed", text: "Failed" }
};

const ToolRow: React.FC<{ entry: Extract<ActivityEntry, { kind: "tool" }> }> = ({
  entry
}) => {
  const Icon = getToolIcon(entry.name);
  const status = TOOL_TONE[entry.status];
  return (
    <FlexColumn
      gap={SPACING.micro}
      fullWidth
      sx={{
        p: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        bgcolor: "action.hover"
      }}
    >
      <FlexRow gap={SPACING.sm} align="center" fullWidth>
        <Icon fontSize="small" sx={{ color: "text.secondary" }} />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {entry.label}
        </Text>
        <StatusPill tone={status.tone}>{status.text}</StatusPill>
      </FlexRow>
      {entry.result ? (
        <Caption color="secondary" sx={{ wordBreak: "break-word" }}>
          {entry.result}
        </Caption>
      ) : null}
    </FlexColumn>
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
        <FlexColumn gap={SPACING.sm} fullWidth>
          {shown.map((entry, index) =>
            entry.kind === "tool" ? (
              <ToolRow key={entry.id} entry={entry} />
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
