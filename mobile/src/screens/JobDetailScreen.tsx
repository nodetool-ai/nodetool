/**
 * Job detail screen.
 *
 * Shows one job's status, workflow, timing, cost and error, plus whatever
 * output it produces. A still-running job is followed live: the screen
 * subscribes to the shared WebSocket by `job_id`, asks the server to replay the
 * job's current state (`reconnect_job`) and folds the incoming messages the
 * same way `stores/WorkflowRunner.ts` does.
 *
 * A finished job has no stored outputs to show — the `jobs` table (and the
 * tRPC `jobs.get` shape built from it) carries status/timing/cost/error only,
 * no results — so once a run ends, its values are gone unless this screen was
 * watching. That case renders an explicit note rather than an empty panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OutputRenderer } from '../components/outputs/OutputRenderer';
import { useTheme } from '../hooks/useTheme';
import { RootStackParamList } from '../navigation/types';
import { webSocketService } from '../services/WebSocketService';
import { trpc } from '../trpc/client';
import {
  formatDuration,
  formatRelative,
  statusColorFor,
  statusVariant,
} from './JobsScreen';
import { isNonEmptyString } from '../utils/typePredicates';

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

/** Statuses for which the server may still emit messages. */
const ACTIVE_STATUSES = new Set([
  'scheduled',
  'queued',
  'pending',
  'starting',
  'running',
  'in_progress',
  'paused',
  'suspended',
  'recovering',
]);

function isActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has((status || '').toLowerCase());
}

type LiveState = {
  status: string | null;
  statusMessage: string | null;
  error: string | null;
  /** Final job result, when the run reports one. */
  result: unknown;
  /** Latest value emitted per node, keyed by node id. */
  nodeResults: Record<string, unknown>;
  nodeNames: Record<string, string>;
  nodeErrors: Record<string, string>;
};

const EMPTY_LIVE: LiveState = {
  status: null,
  statusMessage: null,
  error: null,
  result: undefined,
  nodeResults: {},
  nodeNames: {},
  nodeErrors: {},
};

function str(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

/**
 * Fold one WebSocket message into the live view state.
 *
 * `WorkflowRunner`'s equivalent (`handleMessage`) is module-private and writes
 * into a per-workflow Zustand store that only handles messages once a
 * `workflow` object is loaded, so it can't be driven by a `job_id`
 * subscription. This is the same message contract, reduced to what the screen
 * renders.
 */
function foldJobMessage(
  state: LiveState,
  message: Record<string, unknown>,
): LiveState {
  switch (message.type) {
    case 'job_update': {
      const status = str(message.status);
      const error = str(message.error) ?? str(message.error_message);
      return {
        ...state,
        status: status ?? state.status,
        statusMessage: str(message.message) ?? state.statusMessage,
        error: error ?? state.error,
        result: message.result !== undefined ? message.result : state.result,
      };
    }

    case 'node_update': {
      const nodeId = str(message.node_id);
      if (!nodeId) { return state; }
      const nodeName = str(message.node_name);
      const error = str(message.error);
      return {
        ...state,
        statusMessage: `${nodeName ?? nodeId} ${str(message.status) ?? ''}`.trim(),
        nodeNames: nodeName
          ? { ...state.nodeNames, [nodeId]: nodeName }
          : state.nodeNames,
        nodeResults:
          message.result !== undefined
            ? { ...state.nodeResults, [nodeId]: message.result }
            : state.nodeResults,
        nodeErrors: error
          ? { ...state.nodeErrors, [nodeId]: error }
          : state.nodeErrors,
      };
    }

    case 'output_update': {
      const nodeId = str(message.node_id);
      if (!nodeId || message.value === undefined) { return state; }
      return {
        ...state,
        nodeResults: { ...state.nodeResults, [nodeId]: message.value },
        nodeNames: str(message.node_name)
          ? { ...state.nodeNames, [nodeId]: str(message.node_name) as string }
          : state.nodeNames,
      };
    }

    default:
      return state;
  }
}

export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [liveError, setLiveError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const jobQuery = trpc.jobs.get.useQuery({ id: jobId });
  const job = jobQuery.data;

  const workflowQuery = trpc.workflows.get.useQuery(
    { id: job?.workflow_id ?? '' },
    { enabled: !!job?.workflow_id },
  );

  const cancelJob = trpc.jobs.cancel.useMutation({
    onSuccess: () => {
      utils.jobs.get.invalidate({ id: jobId });
      utils.jobs.list.invalidate();
    },
    onError: (e) => { Alert.alert('Cancel failed', e.message); },
  });

  const workflowName =
    workflowQuery.data?.name ??
    (job?.workflow_id ? `Workflow ${job.workflow_id.substring(0, 8)}` : 'Job');

  useEffect(() => {
    navigation.setOptions({ title: workflowName });
  }, [navigation, workflowName]);

  const persistedStatus = job?.status;
  const workflowId = job?.workflow_id;
  const followLive = isActiveStatus(persistedStatus);

  useEffect(() => {
    if (!followLive) { return; }

    const unsubscribe = webSocketService.subscribe(jobId, (message) => {
      setLive((prev) => foldJobMessage(prev, message));
    });

    webSocketService
      .send({
        type: 'reconnect_job',
        command: 'reconnect_job',
        data: { job_id: jobId, workflow_id: workflowId ?? null },
      })
      .catch((err: unknown) => {
        setLiveError(err instanceof Error ? err.message : String(err));
      });

    return unsubscribe;
  }, [followLive, jobId, workflowId]);

  // Once the live stream reports a terminal state, refetch the row so the
  // final cost / finished_at replace the values the list was showing.
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    const status = live.status;
    if (!status || isActiveStatus(status) || refetchedFor.current === status) {
      return;
    }
    refetchedFor.current = status;
    jobQuery.refetch();
  }, [live.status, jobQuery]);

  const status = live.status ?? persistedStatus ?? 'unknown';
  const variant = statusVariant(status);
  const variantColor = statusColorFor(colors, variant);
  const isRunning = isActiveStatus(status);
  const error = live.error ?? job?.error ?? null;
  const duration = formatDuration(job?.started_at, job?.finished_at);

  const outputs = useMemo(() => {
    const entries = Object.entries(live.nodeResults);
    if (entries.length > 0) {
      return entries.map(([nodeId, value]) => ({
        key: nodeId,
        label: live.nodeNames[nodeId] ?? nodeId,
        value,
      }));
    }
    if (live.result !== undefined && live.result !== null) {
      return [{ key: 'result', label: 'Result', value: live.result }];
    }
    return [];
  }, [live.nodeResults, live.nodeNames, live.result]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel job',
      `Cancel job ${jobId.substring(0, 8)}?`,
      [
        { text: 'Keep running', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: () => { cancelJob.mutate({ id: jobId }); },
        },
      ],
    );
  }, [cancelJob, jobId]);

  if (jobQuery.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (jobQuery.error || !job) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load job</Text>
        <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>
          {jobQuery.error?.message ?? 'Job not found'}
        </Text>
        <TouchableOpacity
          onPress={() => { jobQuery.refetch(); }}
          style={[styles.retryBtn, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading job"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View
        style={[
          styles.card,
          shadows.small,
          { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusPill, { backgroundColor: variantColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: variantColor }]} />
            <Text style={[styles.statusText, { color: variantColor }]}>{status}</Text>
          </View>
          <Text style={[styles.timeText, { color: colors.textTertiary }]}>
            {formatRelative(job.started_at)}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {workflowName}
        </Text>
        <Text style={[styles.idText, { color: colors.textTertiary }]}>Job {job.id}</Text>

        <View style={styles.metaRow}>
          {duration ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{duration}</Text>
            </View>
          ) : null}
          {job.job_type ? (
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{job.job_type}</Text>
            </View>
          ) : null}
          {job.cost != null ? (
            <View style={styles.metaItem}>
              <Ionicons name="card-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                ${job.cost.toFixed(4)}
              </Text>
            </View>
          ) : null}
        </View>

        {isRunning && live.statusMessage ? (
          <Text style={[styles.progressText, { color: colors.textSecondary }]} numberOfLines={2}>
            {live.statusMessage}
          </Text>
        ) : null}

        {isRunning ? (
          <TouchableOpacity
            onPress={handleCancel}
            style={[styles.cancelBtn, { borderColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel job"
          >
            <Ionicons name="stop-circle-outline" size={15} color={colors.error} />
            <Text style={[styles.cancelText, { color: colors.error }]}>Cancel job</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {liveError ? (
        <View style={[styles.errorBox, { backgroundColor: colors.warning + '14' }]}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text style={[styles.errorText, { color: colors.warning }]}>
            Live updates unavailable: {liveError}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Output</Text>

      {outputs.length > 0 ? (
        outputs.map((output) => (
          <View
            key={output.key}
            style={[
              styles.outputCard,
              { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
            ]}
          >
            <Text style={[styles.outputLabel, { color: colors.textSecondary }]}>
              {output.label}
            </Text>
            <OutputRenderer value={output.value} />
          </View>
        ))
      ) : isRunning ? (
        <View style={styles.placeholderBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Waiting for output from the running job...
          </Text>
        </View>
      ) : (
        <View style={styles.placeholderBox}>
          <Ionicons name="archive-outline" size={22} color={colors.textTertiary} />
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            No stored output. NodeTool keeps a job&apos;s status, timing and cost, but not its
            results — outputs are only readable while the run streams them.
          </Text>
        </View>
      )}

      {Object.keys(live.nodeErrors).length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Node errors</Text>
          {Object.entries(live.nodeErrors).map(([nodeId, nodeError]) => (
            <View
              key={nodeId}
              style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>
                {live.nodeNames[nodeId] ?? nodeId}: {nodeError}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600' },
  errorDetail: { fontSize: 13, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  timeText: { fontSize: 12 },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  idText: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  progressText: { fontSize: 12, marginTop: 10 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  cancelText: { fontSize: 13, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderRadius: 8,
  },
  errorText: { fontSize: 12, flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  outputCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  outputLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  placeholderBox: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  placeholderText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
