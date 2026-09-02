/**
 * The compaction record, rendered as a collapsed row.
 *
 * A long thread stops fitting in the model's context, so the turn that would
 * have failed summarizes everything before its last few user turns and sends
 * the summary in their place. The row is stored with `role: "user"` so it is
 * ordinary history to the model, which is why the client has to recognize it:
 * without this branch the summary renders as though the user typed it.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

/**
 * `execution_event_type` of a compaction record. The producer is
 * `COMPACTION_EVENT_TYPE` in `@nodetool-ai/models`; mobile reads the column off
 * the message rather than importing a server package.
 */
export const COMPACTION_EVENT_TYPE = 'compaction';

/** The header the server puts in front of the summary. */
const SUMMARY_HEADER = '[Conversation so far]';

/**
 * The summary without the header the model reads it by. Showing the raw row
 * would put `[Conversation so far]` in front of every row.
 */
export function compactionSummary(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith(SUMMARY_HEADER)
    ? trimmed.slice(SUMMARY_HEADER.length).trim()
    : trimmed;
}

interface CompactionRowProps {
  /** The record's text: `"[Conversation so far]\n<summary>"`. */
  text: string;
}

export const CompactionRow: React.FC<CompactionRowProps> = React.memo(({ text }) => {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const summary = compactionSummary(text);

  const toggle = useCallback(() => setExpanded((open) => !open), []);

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Earlier conversation summarized"
        accessibilityState={{ expanded }}
        style={styles.header}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={colors.textSecondary}
        />
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          Earlier conversation summarized
        </Text>
      </TouchableOpacity>
      {expanded && (
        <Text style={[styles.summary, { color: colors.textSecondary }]}>
          {summary || 'The summary is empty.'}
        </Text>
      )}
    </View>
  );
});

CompactionRow.displayName = 'CompactionRow';

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
  },
  summary: {
    fontSize: 13,
    lineHeight: 20,
    paddingTop: 8,
  },
});

export default CompactionRow;
