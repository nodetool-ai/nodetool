/**
 * Jobs history screen.
 * Lists past workflow executions with status, duration, cost, and the
 * ability to cancel a still-running job. Mirrors the web JobsPanel feature.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { RootStackParamList } from '../navigation/types';
import { apiService, JobResponse } from '../services/api';
import { useTheme } from '../hooks/useTheme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Jobs'>;
};

type StatusVariant = 'running' | 'completed' | 'failed' | 'cancelled' | 'queued' | 'unknown';

function statusVariant(status: string | undefined): StatusVariant {
  const s = (status || '').toLowerCase();
  if (s === 'running' || s === 'in_progress') { return 'running'; }
  if (s === 'completed' || s === 'success' || s === 'succeeded') { return 'completed'; }
  if (s === 'failed' || s === 'error') { return 'failed'; }
  if (s === 'cancelled' || s === 'canceled') { return 'cancelled'; }
  if (s === 'queued' || s === 'pending') { return 'queued'; }
  return 'unknown';
}

function formatDuration(startIso: string | null | undefined, endIso: string | null | undefined): string | null {
  if (!startIso) { return null; }
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) { return null; }
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (Number.isNaN(end) || end < start) { return null; }
  const ms = end - start;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) { return `${minutes}m ${remSec}s`; }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) { return ''; }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) { return iso; }
  const diff = Date.now() - t;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) { return 'just now'; }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) { return `${minutes}m ago`; }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours}h ago`; }
  const days = Math.floor(hours / 24);
  if (days < 7) { return `${days}d ago`; }
  return new Date(iso).toLocaleDateString();
}

export default function JobsScreen({ navigation: _navigation }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [jobsData, workflowsData] = await Promise.all([
        apiService.listJobs({ limit: 100 }),
        apiService.getWorkflows().catch(() => undefined),
      ]);
      setJobs(jobsData.jobs || []);
      const lookup: Record<string, string> = {};
      const list = Array.isArray(workflowsData)
        ? workflowsData
        : (workflowsData?.workflows || []);
      for (const w of list) {
        if (w?.id && w?.name) { lookup[w.id] = w.name; }
      }
      setWorkflowNames(lookup);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load jobs';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleCancel = useCallback((job: JobResponse) => {
    Alert.alert(
      'Cancel job',
      `Cancel job ${job.id.substring(0, 8)}?`,
      [
        { text: 'Keep running', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.cancelJob(job.id);
              await load();
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Failed to cancel job';
              Alert.alert('Cancel failed', message);
            }
          },
        },
      ],
    );
  }, [load]);

  const statusColor = useCallback((variant: StatusVariant) => {
    switch (variant) {
      case 'running': return colors.info;
      case 'completed': return colors.success;
      case 'failed': return colors.error;
      case 'cancelled': return colors.warning;
      case 'queued': return colors.textSecondary;
      default: return colors.textTertiary;
    }
  }, [colors]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aT = new Date(a.started_at).getTime();
      const bT = new Date(b.started_at).getTime();
      return bT - aT;
    });
  }, [jobs]);

  const renderItem = ({ item }: { item: JobResponse }) => {
    const variant = statusVariant(item.status);
    const variantColor = statusColor(variant);
    const duration = formatDuration(item.started_at, item.finished_at);
    const isRunning = variant === 'running' || variant === 'queued';
    const workflowName = workflowNames[item.workflow_id] || `Workflow ${item.workflow_id.substring(0, 8)}`;

    return (
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
            <Text style={[styles.statusText, { color: variantColor }]}>
              {item.status}
            </Text>
          </View>
          <Text style={[styles.timeText, { color: colors.textTertiary }]}>
            {formatRelative(item.started_at)}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {workflowName}
        </Text>
        <Text style={[styles.idText, { color: colors.textTertiary }]} numberOfLines={1}>
          Job {item.id}
        </Text>

        <View style={styles.metaRow}>
          {duration ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{duration}</Text>
            </View>
          ) : null}
          {item.job_type ? (
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.job_type}</Text>
            </View>
          ) : null}
          {typeof item.cost === 'number' ? (
            <View style={styles.metaItem}>
              <Ionicons name="card-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                ${item.cost.toFixed(4)}
              </Text>
            </View>
          ) : null}
        </View>

        {item.error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}>
            <Ionicons name="alert-circle-outline" size={13} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={3}>
              {item.error}
            </Text>
          </View>
        ) : null}

        {isRunning ? (
          <TouchableOpacity
            onPress={() => handleCancel(item)}
            style={[styles.cancelBtn, { borderColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel job"
          >
            <Ionicons name="stop-circle-outline" size={15} color={colors.error} />
            <Text style={[styles.cancelText, { color: colors.error }]}>Cancel job</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loadError && (
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={14} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={sortedJobs}
        keyExtractor={(j) => j.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No jobs yet
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              Run a workflow to see it here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { fontSize: 13, fontWeight: '500' },
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
  title: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  idText: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  errorText: { fontSize: 12, flex: 1 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  cancelText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13 },
});
