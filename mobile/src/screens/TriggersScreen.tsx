/**
 * Triggers monitoring screen.
 *
 * Answers the away-from-desk questions: which workflows are armed, when each
 * last fired, whether any is broken — and gives a one-tap kill switch. It does
 * not create or edit triggers; authoring a schedule or wiring a webhook stays
 * in the web editor.
 *
 * Two sources are merged because neither is enough alone:
 *  - `jobs.triggersRunning` returns every *enabled* registration the caller
 *    owns in one call, but a trigger disarmed from this screen would then
 *    vanish and could never be re-armed.
 *  - `triggers.listByWorkflow` returns disabled rows too (and the schedule
 *    fields), but only one workflow at a time, so it is fanned out over the
 *    workflow list and batched by the tRPC HTTP link.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeTriggerDisabledReason } from '@nodetool-ai/protocol/triggers';

import { RootStackParamList } from '../navigation/types';
import { trpc } from '../trpc/client';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors, ThemeShadows } from '../utils/theme';
import { formatRelative } from './JobsScreen';
import { isFiniteNumber, isRecord, isString } from '../utils/typePredicates';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Triggers'>;
};

/**
 * One registration as this screen needs it.
 *
 * `next_fire_at` and `interval_seconds` are optional: the server sets them
 * only for `kind === "schedule"`, and older servers omit them entirely.
 */
export interface TriggerRow {
  id: string;
  workflow_id: string;
  node_id: string;
  kind: string;
  enabled: boolean;
  last_fired_at: string | null;
  last_error: string | null;
  /**
   * Why the dispatcher disarmed this registration, if it did. A trigger that
   * stopped on its own is the reason to open this screen at all, so it sorts
   * first and says so on the card.
   */
  disabled_reason?: string | null;
  consecutive_failures?: number | null;
  next_fire_at?: string | null;
  interval_seconds?: number | null;
}

function readString(source: unknown, key: string): string | null {
  if (!isRecord(source)) {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return isString(value) ? value : null;
}

function readNumber(source: unknown, key: string): number | null {
  if (!isRecord(source)) {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return isFiniteNumber(value) ? value : null;
}

/**
 * Normalize a registration from either endpoint. Both shapes share the core
 * fields; the schedule fields are read defensively so a server that predates
 * them still yields a valid row.
 */
function toTriggerRow(raw: unknown): TriggerRow | null {
  const id = readString(raw, 'id');
  const workflowId = readString(raw, 'workflow_id');
  if (!id || !workflowId) {
    return null;
  }
  const enabled = (raw as Record<string, unknown>).enabled;
  return {
    id,
    workflow_id: workflowId,
    node_id: readString(raw, 'node_id') ?? '',
    kind: readString(raw, 'kind') ?? 'unknown',
    enabled: enabled === true,
    last_fired_at: readString(raw, 'last_fired_at'),
    last_error: readString(raw, 'last_error'),
    disabled_reason: readString(raw, 'disabled_reason'),
    consecutive_failures: readNumber(raw, 'consecutive_failures'),
    next_fire_at: readString(raw, 'next_fire_at'),
    interval_seconds: readNumber(raw, 'interval_seconds'),
  };
}

/**
 * Merge the per-workflow rows over the running set. The per-workflow row wins
 * — it carries the schedule fields — while a running row with no per-workflow
 * match is kept, so a trigger on a workflow past the list limit still shows.
 */
export function mergeTriggerRows(
  running: readonly TriggerRow[],
  perWorkflow: readonly TriggerRow[],
): TriggerRow[] {
  const byId = new Map<string, TriggerRow>();
  for (const row of running) {
    byId.set(row.id, row);
  }
  for (const row of perWorkflow) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => {
    // A trigger that stopped on its own outranks one that merely failed: the
    // second is still running, the first has silently stopped automating.
    if (!!a.disabled_reason !== !!b.disabled_reason) {
      return a.disabled_reason ? -1 : 1;
    }
    if (!!a.last_error !== !!b.last_error) {
      return a.last_error ? -1 : 1;
    }
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    const aFired = a.last_fired_at ? new Date(a.last_fired_at).getTime() : 0;
    const bFired = b.last_fired_at ? new Date(b.last_fired_at).getTime() : 0;
    if (aFired !== bFired) {
      return bFired - aFired;
    }
    return a.id.localeCompare(b.id);
  });
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'schedule': return 'Schedule';
    case 'webhook': return 'Webhook';
    case 'manual': return 'Manual';
    case 'file': return 'File watch';
    case 'email': return 'Email';
    default: return kind;
  }
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function kindIcon(kind: string): IoniconName {
  switch (kind) {
    case 'schedule': return 'alarm-outline';
    case 'webhook': return 'globe-outline';
    case 'manual': return 'hand-left-outline';
    case 'file': return 'folder-open-outline';
    case 'email': return 'mail-outline';
    default: return 'flash-outline';
  }
}

/** "in 4m" / "due now" — the countdown to a schedule trigger's next run. */
function formatCountdown(iso: string | null | undefined): string | null {
  if (!iso) { return null; }
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) { return null; }
  const seconds = Math.round((target - Date.now()) / 1000);
  if (seconds <= 0) { return 'due now'; }
  if (seconds < 60) { return `in ${seconds}s`; }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) { return `in ${minutes}m`; }
  const hours = Math.round(minutes / 60);
  if (hours < 24) { return `in ${hours}h`; }
  return `in ${Math.round(hours / 24)}d`;
}

export function formatInterval(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  if (seconds < 60) { return `every ${Math.round(seconds)}s`; }
  const minutes = seconds / 60;
  if (minutes < 60) { return `every ${Math.round(minutes)}m`; }
  const hours = minutes / 60;
  if (hours < 24) { return `every ${Math.round(hours)}h`; }
  return `every ${Math.round(hours / 24)}d`;
}

// `useQueries` returns a fresh results array every render, so a `useMemo` keyed
// on it never hits and every row object is rebuilt. Cache on the payload instead,
// so rows keep the identity `React.memo` needs.
const rowsByPayload = new WeakMap<object, TriggerRow[]>();

function rowsFromPayload(data: unknown): TriggerRow[] {
  if (!isRecord(data)) {
    return [];
  }
  const cached = rowsByPayload.get(data);
  if (cached) {
    return cached;
  }
  const rows: TriggerRow[] = [];
  for (const raw of (data as { triggers?: unknown[] }).triggers ?? []) {
    const row = toTriggerRow(raw);
    if (row) { rows.push(row); }
  }
  rowsByPayload.set(data, rows);
  return rows;
}

const keyExtractor = (row: TriggerRow) => row.id;

const TriggerCard = React.memo(function TriggerCard({
  row,
  workflowName,
  busy,
  colors,
  shadows,
  onToggle,
  onViewRuns,
}: {
  row: TriggerRow;
  workflowName: string;
  busy: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  onToggle: (row: TriggerRow) => void;
  onViewRuns: (workflowId: string) => void;
}) {
  const handleToggle = useCallback(() => onToggle(row), [onToggle, row]);
  const handleViewRuns = useCallback(
    () => onViewRuns(row.workflow_id),
    [onViewRuns, row.workflow_id],
  );

  const stoppedBecause = describeTriggerDisabledReason(
    row.disabled_reason,
    row.consecutive_failures ?? 0,
  );
  const stateColor =
    stoppedBecause || row.last_error
      ? colors.error
      : row.enabled
        ? colors.success
        : colors.textTertiary;
  const stateText = stoppedBecause
    ? 'Stopped'
    : row.last_error
      ? 'Failing'
      : row.enabled
        ? 'Armed'
        : 'Disarmed';
  const countdown = row.enabled ? formatCountdown(row.next_fire_at) : null;
  const interval = formatInterval(row.interval_seconds);

  return (
    <View
      style={[
        styles.card,
        shadows.small,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statePill, { backgroundColor: stateColor + '20' }]}>
          <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
          <Text style={[styles.stateText, { color: stateColor }]}>{stateText}</Text>
        </View>
        <View style={styles.kindRow}>
          <Ionicons name={kindIcon(row.kind)} size={13} color={colors.textSecondary} />
          <Text style={[styles.kindText, { color: colors.textSecondary }]}>
            {kindLabel(row.kind)}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {workflowName}
      </Text>
      <Text style={[styles.nodeText, { color: colors.textTertiary }]} numberOfLines={1}>
        {row.node_id || row.id}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {row.last_fired_at ? `Fired ${formatRelative(row.last_fired_at)}` : 'Never fired'}
          </Text>
        </View>
        {countdown ? (
          <View style={styles.metaItem}>
            <Ionicons name="alarm-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              Next {countdown}
            </Text>
          </View>
        ) : null}
        {interval ? (
          <View style={styles.metaItem}>
            <Ionicons name="repeat-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{interval}</Text>
          </View>
        ) : null}
      </View>

      {stoppedBecause ? (
        <View style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}>
          <Ionicons name="hand-left-outline" size={13} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={3}>
            {stoppedBecause} Arm it again to retry.
          </Text>
        </View>
      ) : null}

      {row.last_error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}>
          <Ionicons name="alert-circle-outline" size={13} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={3}>
            {row.last_error}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleViewRuns}
          style={[styles.secondaryBtn, { borderColor: colors.borderLight }]}
          accessibilityRole="button"
          accessibilityLabel={`View runs of ${workflowName}`}
        >
          <Ionicons name="list-outline" size={15} color={colors.textSecondary} />
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Runs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleToggle}
          disabled={busy}
          style={[
            styles.toggleBtn,
            { borderColor: row.enabled ? colors.error : colors.success },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={`${row.enabled ? 'Disarm' : 'Arm'} ${kindLabel(row.kind).toLowerCase()} trigger on ${workflowName}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={row.enabled ? colors.error : colors.success} />
          ) : (
            <>
              <Ionicons
                name={row.enabled ? 'stop-circle-outline' : 'play-circle-outline'}
                size={15}
                color={row.enabled ? colors.error : colors.success}
              />
              <Text
                style={[
                  styles.toggleText,
                  { color: row.enabled ? colors.error : colors.success },
                ]}
              >
                {row.enabled ? 'Disarm' : 'Arm'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function TriggersScreen({ navigation }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const utils = trpc.useUtils();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const runningQuery = trpc.jobs.triggersRunning.useQuery();
  const workflowsQuery = trpc.workflows.list.useQuery({ limit: 100 });

  const workflows = useMemo(
    () => workflowsQuery.data?.workflows ?? [],
    [workflowsQuery.data],
  );
  const workflowNames = useMemo(() => {
    const lookup: Record<string, string> = {};
    for (const w of workflows) {
      if (w?.id && w?.name) { lookup[w.id] = w.name; }
    }
    return lookup;
  }, [workflows]);

  const workflowIds = useMemo(
    () => workflows.map((w) => w.id).filter((id): id is string => Boolean(id)),
    [workflows],
  );

  const byWorkflowQueries = trpc.useQueries((t) =>
    workflowIds.map((workflowId) => t.triggers.listByWorkflow({ workflowId })),
  );

  const perWorkflowRows = useMemo(
    () => byWorkflowQueries.flatMap((query) => rowsFromPayload(query.data)),
    [byWorkflowQueries],
  );

  const runningRows = useMemo(
    () => rowsFromPayload(runningQuery.data),
    [runningQuery.data],
  );

  const rows = useMemo(
    () => mergeTriggerRows(runningRows, perWorkflowRows),
    [runningRows, perWorkflowRows],
  );

  const armedCount = rows.filter((r) => r.enabled).length;
  const brokenCount = rows.filter((r) => r.last_error).length;

  const partialFailure = byWorkflowQueries.some((q) => Boolean(q.error));
  const loadError = runningQuery.error?.message ?? null;
  const isLoading = runningQuery.isLoading || workflowsQuery.isLoading;
  const isRefetching =
    runningQuery.isRefetching || byWorkflowQueries.some((q) => q.isRefetching);

  const refreshAll = useCallback(() => {
    runningQuery.refetch();
    workflowsQuery.refetch();
    utils.triggers.listByWorkflow.invalidate();
  }, [runningQuery, workflowsQuery, utils]);

  const invalidateAll = useCallback(() => {
    utils.jobs.triggersRunning.invalidate();
    utils.triggers.listByWorkflow.invalidate();
  }, [utils]);

  const startTrigger = trpc.jobs.triggerStart.useMutation({
    onSuccess: () => { invalidateAll(); },
    onError: (e) => { Alert.alert('Could not arm trigger', e.message); },
    onSettled: () => { setPendingId(null); },
  });
  const stopTrigger = trpc.jobs.triggerStop.useMutation({
    onSuccess: () => { invalidateAll(); },
    onError: (e) => { Alert.alert('Could not disarm trigger', e.message); },
    onSettled: () => { setPendingId(null); },
  });

  const handleToggle = useCallback((row: TriggerRow) => {
    const name = workflowNames[row.workflow_id] ?? 'this workflow';
    if (!row.enabled) {
      setPendingId(row.id);
      startTrigger.mutate({ id: row.id });
      return;
    }
    Alert.alert(
      'Disarm trigger',
      `Stop the ${kindLabel(row.kind).toLowerCase()} trigger on ${name}? It will not fire again until you arm it.`,
      [
        { text: 'Keep armed', style: 'cancel' },
        {
          text: 'Disarm',
          style: 'destructive',
          onPress: () => {
            setPendingId(row.id);
            stopTrigger.mutate({ id: row.id });
          },
        },
      ],
    );
  }, [startTrigger, stopTrigger, workflowNames]);

  const handleViewRuns = useCallback(
    (workflowId: string) => {
      navigation.navigate('Jobs', { workflowId });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: TriggerRow }) => (
      <TriggerCard
        row={item}
        workflowName={
          workflowNames[item.workflow_id] ?? `Workflow ${item.workflow_id.substring(0, 8)}`
        }
        busy={pendingId === item.id}
        colors={colors}
        shadows={shadows}
        onToggle={handleToggle}
        onViewRuns={handleViewRuns}
      />
    ),
    [workflowNames, pendingId, colors, shadows, handleToggle, handleViewRuns],
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          Loading triggers...
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={36} color={colors.error} />
        <Text style={[styles.centerTitle, { color: colors.text }]}>Could not load triggers</Text>
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>{loadError}</Text>
        <TouchableOpacity
          onPress={refreshAll}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading triggers"
        >
          <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {partialFailure ? (
        <View style={[styles.banner, { backgroundColor: colors.warning + '18' }]}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            Some workflows could not be checked. The list may be incomplete.
          </Text>
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View style={[styles.summary, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {`${armedCount} armed of ${rows.length}`}
            {brokenCount > 0 ? ` · ${brokenCount} failing` : ''}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refreshAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="flash-off-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No triggers yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              Add a schedule or webhook trigger to a workflow in the web editor, and it shows up
              here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  centerTitle: { fontSize: 16, fontWeight: '600' },
  centerText: { fontSize: 13, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 8,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryText: { fontSize: 12, fontWeight: '600' },
  list: { padding: 16 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stateDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  stateText: { fontSize: 12, fontWeight: '600' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindText: { fontSize: 12 },
  title: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  nodeText: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
  },
  errorText: { fontSize: 12, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 12, fontWeight: '600' },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 96,
  },
  toggleText: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 6 },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
