/**
 * Floating toolbar for the mobile chain editor.
 * Mirrors the web's FloatingToolBar with mobile-appropriate actions.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useGraphEditorStore } from "../../stores/GraphEditorStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import type { RunnerState } from "../../stores/WorkflowRunner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FloatingToolbarProps {
  workflowId?: string;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = memo(
  function FloatingToolbar({ workflowId }) {
    const { colors, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    const chain = useGraphEditorStore((s) => s.chain);
    const saveWorkflow = useGraphEditorStore((s) => s.saveWorkflow);
    const showNodePicker = useGraphEditorStore((s) => s.showNodePicker);
    const storeWorkflowId = useGraphEditorStore((s) => s.workflowId);

    // Use store workflowId (updated after save) with prop as fallback
    const effectiveWorkflowId = storeWorkflowId || workflowId;

    // Subscribe to runner store state without conditional hooks
    const [runState, setRunState] = useState<RunnerState>("idle");

    useEffect(() => {
      if (!effectiveWorkflowId) {
        setRunState("idle");
        return;
      }
      const store = getWorkflowRunnerStore(effectiveWorkflowId);
      const update = () => {
        const s = store.getState();
        setRunState(s.state);
      };
      update();
      return store.subscribe(update);
    }, [effectiveWorkflowId]);

    const cancel = useMemo(() => {
      if (!effectiveWorkflowId) {return undefined;}
      return getWorkflowRunnerStore(effectiveWorkflowId).getState().cancel;
    }, [effectiveWorkflowId]);

    const isRunning = runState === "running" || runState === "connecting";

    // Spin animation for running state
    const spinAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!isRunning) {
        spinAnim.setValue(0);
        return;
      }
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    }, [isRunning, spinAnim]);

    const spin = spinAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });

    // Running time
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
      if (isRunning) {
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      } else {
        if (timerRef.current) {clearInterval(timerRef.current);}
      }
      return () => {
        if (timerRef.current) {clearInterval(timerRef.current);}
      };
    }, [isRunning]);

    const formatTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
    };

    const handleSave = useCallback(async () => {
      await saveWorkflow();
    }, [saveWorkflow]);

    const handleRun = useCallback(async () => {
      try {
        // Save first to ensure we have a persisted workflow with current edits
        const saved = await saveWorkflow();
        if (!saved) {
          console.error("Cannot run: workflow save failed");
          return;
        }
        // Get runner store using the saved workflow's ID
        // (handles new workflows that didn't have an ID before save)
        const runner = getWorkflowRunnerStore(saved.id);
        await runner.getState().run({}, saved);
      } catch (err) {
        console.error("Failed to run workflow:", err);
      }
    }, [saveWorkflow]);

    const handleStop = useCallback(() => {
      cancel?.();
    }, [cancel]);

    const handleAddNode = useCallback(() => {
      showNodePicker(-1);
    }, [showNodePicker]);

    return (
      <View
        style={[
          styles.container,
          shadows.medium,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            bottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Add Node */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primaryMuted }]}
          onPress={handleAddNode}
          accessibilityRole="button"
          accessibilityLabel="Add node"
        >
          <Ionicons name="add-circle" size={22} color={colors.primary} />
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primaryMuted }]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save workflow"
        >
          <Ionicons name="save-outline" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Stop */}
        {isRunning && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.error + "20" }]}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop workflow"
          >
            <Ionicons name="stop" size={20} color={colors.error} />
          </TouchableOpacity>
        )}

        {/* Run / Running indicator */}
        <TouchableOpacity
          style={[
            styles.runButton,
            isRunning && styles.runButtonRunning,
            {
              backgroundColor: isRunning ? colors.surface : colors.primary,
              borderColor: colors.primary,
              borderWidth: isRunning ? 2 : 0,
            },
          ]}
          onPress={isRunning ? undefined : handleRun}
          disabled={isRunning || chain.length === 0}
          activeOpacity={isRunning ? 1 : 0.7}
          accessibilityRole="button"
          accessibilityLabel={isRunning ? "Running" : "Run workflow"}
        >
          {isRunning ? (
            <View style={styles.runningContent}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons
                  name="sync-outline"
                  size={18}
                  color={colors.primary}
                />
              </Animated.View>
              <Text style={[styles.runningText, { color: colors.primary }]}>
                {formatTime(elapsed)}
              </Text>
            </View>
          ) : (
            <Ionicons name="play" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "center",
    maxWidth: 400,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  runButton: {
    // A circle when it holds a single icon, a pill once the running state adds
    // an elapsed timer next to the spinner — a hard 44pt width made that row
    // spill over the neighbouring Stop button.
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  runButtonRunning: {
    paddingHorizontal: 12,
  },
  runningContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  runningText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
  },
});
