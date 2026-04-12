/**
 * ExecutionTree — React Native port of web/src/components/execution/ExecutionTree.tsx.
 *
 * Renders an agent's planning log, tasks, and steps as an interactive tree,
 * styled for the mobile chat view. Tasks can be expanded or collapsed via tap.
 */

import React, { memo, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import type {
  ExecutionTreeState,
  TaskState,
  StepState,
  PlanningEntry,
  LogEntry,
} from '../../hooks/useExecutionTreeState';
import { useTheme } from '../../hooks/useTheme';

const ICONS = {
  waiting: '\u25CB', // ○
  running: '\u25D0', // ◐
  completed: '\u2713', // ✓
  failed: '\u2717', // ✗
  plan: '\u25C6', // ◆
} as const;

const PHASE_ICONS_DONE: Record<string, string> = {
  initialization: ICONS.completed,
  generation: ICONS.completed,
  validation: ICONS.failed,
  complete: ICONS.completed,
};

const PHASE_ICONS_ACTIVE: Record<string, string> = {
  initialization: ICONS.running,
  generation: ICONS.running,
  validation: ICONS.failed,
  complete: ICONS.completed,
};

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) { return ''; }
  if (seconds < 0.1) { return '<0.1s'; }
  if (seconds < 60) { return `${seconds.toFixed(1)}s`; }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs.toFixed(0)}s`;
}

function truncateOutput(output: string, maxLines: number = 2): string {
  if (!output) { return ''; }
  const lines = output.trim().split('\n');
  const truncated = lines.slice(-maxLines);
  let result = truncated.join('\n').slice(0, 120);
  if (lines.length > maxLines) { result = '...' + result; }
  return result;
}

// ---------------------------------------------------------------------------
// Running-icon pulse animation
// ---------------------------------------------------------------------------

interface PulseIconProps {
  icon: string;
  style: any;
}

const PulseIcon = memo(({ icon, style }: PulseIconProps) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.Text style={[style, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}>
      {icon}
    </Animated.Text>
  );
});
PulseIcon.displayName = 'PulseIcon';

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

interface StepNodeProps {
  step: StepState;
  isLast: boolean;
  parentPrefix: string;
}

const StepNode = memo(({ step, isLast, parentPrefix }: StepNodeProps) => {
  const { colors } = useTheme();
  const branch = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  const cont = isLast ? '   ' : '\u2502  ';
  const icon = ICONS[step.status];
  const iconColor = getStatusColor(step.status, colors);

  const displayName = step.toolName
    ? step.toolArgs
      ? `${step.toolName}(${step.toolArgs.slice(0, 50)})`
      : step.toolName
    : step.name.slice(0, 60);

  const duration =
    step.duration !== undefined ? ` ${formatDuration(step.duration)}` : '';
  const outputPreview = truncateOutput(step.output);
  const errorPreview = step.error ? step.error.slice(0, 120) : '';

  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.branch, { color: colors.textTertiary }]}>
          {parentPrefix}
          {branch}
        </Text>
        {step.status === 'running' ? (
          <PulseIcon icon={icon} style={[styles.icon, { color: iconColor }]} />
        ) : (
          <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
        )}
        <Text
          style={[styles.stepName, { color: iconColor }]}
          numberOfLines={1}
        >
          {' '}
          {displayName}
        </Text>
        {!!duration && (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {duration}
          </Text>
        )}
      </View>
      {!!outputPreview && step.status === 'running' && (
        <Text
          style={[styles.stepOutput, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {parentPrefix}
          {cont}
          {'   \u2192 '}
          {outputPreview}
        </Text>
      )}
      {!!errorPreview && (
        <Text
          style={[styles.stepError, { color: colors.error }]}
          numberOfLines={2}
        >
          {parentPrefix}
          {cont}
          {'   \u2717 '}
          {errorPreview}
        </Text>
      )}
    </View>
  );
});
StepNode.displayName = 'StepNode';

// ---------------------------------------------------------------------------
// Task rendering
// ---------------------------------------------------------------------------

interface TaskNodeProps {
  task: TaskState;
  isLast: boolean;
  onToggle: () => void;
}

const TaskNode = memo(({ task, isLast, onToggle }: TaskNodeProps) => {
  const { colors } = useTheme();
  const branch = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  const cont = isLast ? '   ' : '\u2502  ';
  const icon = ICONS[task.status];
  const iconColor = getStatusColor(task.status, colors);

  const duration =
    task.duration !== undefined ? formatDuration(task.duration) : '';
  const stepCount = task.steps.length;
  const completedSteps = task.steps.filter(
    (s) => s.status === 'completed'
  ).length;

  if (!task.expanded) {
    return (
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Expand task ${task.name}`}
      >
        <View style={styles.row}>
          <Text style={[styles.branch, { color: colors.textTertiary }]}>
            {branch}
          </Text>
          {task.status === 'running' ? (
            <PulseIcon icon={icon} style={[styles.icon, { color: iconColor }]} />
          ) : (
            <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
          )}
          <Text
            style={[styles.taskName, { color: iconColor }]}
            numberOfLines={1}
          >
            {' '}
            {task.name}
          </Text>
          {!!duration && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {' '}
              {duration}
            </Text>
          )}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {' '}
            ({completedSteps}/{stepCount} steps)
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Collapse task ${task.name}`}
      >
        <View style={styles.row}>
          <Text style={[styles.branch, { color: colors.textTertiary }]}>
            {branch}
          </Text>
          {task.status === 'running' ? (
            <PulseIcon icon={icon} style={[styles.icon, { color: iconColor }]} />
          ) : (
            <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
          )}
          <Text
            style={[styles.taskName, { color: iconColor }]}
            numberOfLines={1}
          >
            {' '}
            {task.name}
          </Text>
          {task.status === 'waiting' && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {' '}
              waiting
            </Text>
          )}
        </View>
      </TouchableOpacity>
      {task.steps.map((step, i) => (
        <StepNode
          key={step.id || `step-${i}`}
          step={step}
          isLast={i === task.steps.length - 1}
          parentPrefix={cont}
        />
      ))}
    </View>
  );
});
TaskNode.displayName = 'TaskNode';

// ---------------------------------------------------------------------------
// Planning log
// ---------------------------------------------------------------------------

interface PlanningLogProps {
  entries: PlanningEntry[];
  logs: LogEntry[];
  isActive: boolean;
}

const PlanningLog = memo(({ entries, logs: _logs, isActive }: PlanningLogProps) => {
  const { colors } = useTheme();

  if (entries.length === 0) {
    if (isActive) {
      return (
        <View style={styles.row}>
          <PulseIcon
            icon={ICONS.running}
            style={[styles.icon, { color: colors.primary }]}
          />
          <Text style={[styles.planningText, { color: colors.textSecondary }]}>
            {' '}
            planning
          </Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={styles.planningContainer}>
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const isRunning = isLast && isActive;
        const statusColor =
          entry.status === 'failed'
            ? colors.error
            : entry.status === 'success'
              ? colors.success
              : isRunning
                ? colors.primary
                : colors.success;
        const icons = isRunning ? PHASE_ICONS_ACTIVE : PHASE_ICONS_DONE;
        const icon = icons[entry.phase] ?? ICONS.waiting;

        return (
          <View key={`${entry.phase}-${i}`} style={styles.row}>
            {isRunning ? (
              <PulseIcon icon={icon} style={[styles.icon, { color: statusColor }]} />
            ) : (
              <Text style={[styles.icon, { color: statusColor }]}>{icon}</Text>
            )}
            <Text
              style={[
                styles.planningPhase,
                { color: statusColor },
              ]}
            >
              {' '}
              {entry.phase}
            </Text>
            <Text
              style={[styles.planningContent, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {' '}
              {entry.content}
            </Text>
          </View>
        );
      })}
    </View>
  );
});
PlanningLog.displayName = 'PlanningLog';

// ---------------------------------------------------------------------------
// Status color helper
// ---------------------------------------------------------------------------

function getStatusColor(
  status: StepState['status'] | TaskState['status'],
  colors: ReturnType<typeof useTheme>['colors']
): string {
  switch (status) {
    case 'waiting':
      return colors.textTertiary;
    case 'running':
      return colors.primary;
    case 'completed':
      return colors.success;
    case 'failed':
      return colors.error;
    default:
      return colors.text;
  }
}

// ---------------------------------------------------------------------------
// Main tree
// ---------------------------------------------------------------------------

interface ExecutionTreeProps {
  state: ExecutionTreeState;
  onToggleTask: (taskId: string) => void;
}

export const ExecutionTree: React.FC<ExecutionTreeProps> = ({
  state,
  onToggleTask,
}) => {
  const { colors } = useTheme();

  const completedCount = useMemo(
    () => state.tasks.filter((t) => t.status === 'completed').length,
    [state.tasks]
  );

  if (state.phase === 'idle') { return null; }

  const hasTasks = state.tasks.length > 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.assistantBubbleBg,
          borderColor: colors.borderLight,
        },
      ]}
      accessibilityLabel="Agent execution tree"
    >
      {state.planningLog.length > 0 && (
        <PlanningLog
          entries={state.planningLog}
          logs={state.logs}
          isActive={state.phase === 'planning'}
        />
      )}
      {state.phase === 'planning' && state.planningLog.length === 0 && (
        <View style={styles.row}>
          <PulseIcon
            icon={ICONS.running}
            style={[styles.icon, { color: colors.primary }]}
          />
          <Text style={[styles.planningText, { color: colors.textSecondary }]}>
            {' '}
            planning
          </Text>
        </View>
      )}
      {hasTasks && (
        <>
          <View style={[styles.row, styles.planHeader]}>
            <Text style={[styles.planIcon, { color: colors.primary }]}>
              {ICONS.plan}
            </Text>
            <Text style={[styles.planLabel, { color: colors.primary }]}>
              {' '}
              Plan
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {' '}
              ({completedCount}/{state.tasks.length} tasks)
            </Text>
          </View>
          <View>
            {state.tasks.map((task, i) => (
              <TaskNode
                key={task.id || `task-${i}`}
                task={task}
                isLast={i === state.tasks.length - 1}
                onToggle={() => onToggleTask(task.id)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
};

ExecutionTree.displayName = 'ExecutionTree';

const MONOSPACE = 'Courier';

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginVertical: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  planHeader: {
    marginBottom: 2,
  },
  planIcon: {
    fontFamily: MONOSPACE,
    fontSize: 13,
    fontWeight: '700',
  },
  planLabel: {
    fontFamily: MONOSPACE,
    fontSize: 13,
    fontWeight: '700',
  },
  branch: {
    fontFamily: MONOSPACE,
    fontSize: 12,
  },
  icon: {
    fontFamily: MONOSPACE,
    fontSize: 12,
    fontWeight: '600',
  },
  taskName: {
    flexShrink: 1,
    fontFamily: MONOSPACE,
    fontSize: 13,
    fontWeight: '600',
  },
  stepName: {
    flexShrink: 1,
    fontFamily: MONOSPACE,
    fontSize: 12,
  },
  meta: {
    fontFamily: MONOSPACE,
    fontSize: 11,
  },
  stepOutput: {
    fontFamily: MONOSPACE,
    fontSize: 11,
    marginLeft: 8,
  },
  stepError: {
    fontFamily: MONOSPACE,
    fontSize: 11,
    marginLeft: 8,
  },
  planningContainer: {
    marginBottom: 4,
  },
  planningText: {
    fontFamily: MONOSPACE,
    fontSize: 12,
  },
  planningPhase: {
    fontFamily: MONOSPACE,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  planningContent: {
    flexShrink: 1,
    fontFamily: MONOSPACE,
    fontSize: 11,
  },
});

export default ExecutionTree;
