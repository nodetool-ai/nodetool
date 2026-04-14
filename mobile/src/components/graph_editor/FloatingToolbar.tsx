/**
 * Floating toolbar for the mobile chain editor.
 * Mirrors the web's FloatingToolBar with mobile-appropriate actions.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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
import { useWorkflowRunner } from "../../stores/WorkflowRunner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FloatingToolbarProps {
  workflowId?: string;
  onToggleView?: () => void;
  viewMode: "editor" | "runner";
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = memo(
  function FloatingToolbar({ workflowId, onToggleView, viewMode }) {
    const { colors, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    const chain = useGraphEditorStore((s) => s.chain);
    const saveWorkflow = useGraphEditorStore((s) => s.saveWorkflow);
    const showNodePicker = useGraphEditorStore((s) => s.showNodePicker);

    // Workflow runner state (only when we have a workflowId)
    const runnerStore = workflowId
      ? useWorkflowRunner(workflowId)
      : null;
    const runState = runnerStore?.((s) => s.state) ?? "idle";
    const run = runnerStore?.((s) => s.run);
    const cancel = runnerStore?.((s) => s.cancel);
    const resume = runnerStore?.((s) => s.resume);
    const statusMessage = runnerStore?.((s) => s.statusMessage);

    const isRunning = runState === "running" || runState === "connecting";
    const isPaused = runState === "paused" || runState === "suspended";

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
        if (timerRef.current) clearInterval(timerRef.current);
      }
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [isRunning]);

    const formatTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
    };

    const handleSave = useCallback(async () => {
      const result = await saveWorkflow();
      // No alert — the save button briefly changes to indicate success
    }, [saveWorkflow]);

    const handleRun = useCallback(async () => {
      if (!run) return;
      try {
        // Save first to ensure we have a persisted workflow with current edits
        const saved = await saveWorkflow();
        if (!saved) {
          console.error("Cannot run: workflow save failed");
          return;
        }
        await run({}, saved);
      } catch (err) {
        console.error("Failed to run workflow:", err);
      }
    }, [run, saveWorkflow]);

    const handleStop = useCallback(() => {
      cancel?.();
    }, [cancel]);

    const handleResume = useCallback(() => {
      resume?.();
    }, [resume]);

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
        {viewMode === "editor" && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primaryMuted }]}
            onPress={handleAddNode}
            accessibilityRole="button"
            accessibilityLabel="Add node"
          >
            <Ionicons name="add-circle" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Toggle View */}
        {workflowId && onToggleView && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primaryMuted }]}
            onPress={onToggleView}
            accessibilityRole="button"
            accessibilityLabel={
              viewMode === "editor" ? "Switch to runner" : "Switch to editor"
            }
          >
            <Ionicons
              name={viewMode === "editor" ? "play-outline" : "git-network-outline"}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}

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
        {(isRunning || isPaused) && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.error + "20" }]}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop workflow"
          >
            <Ionicons name="stop" size={20} color={colors.error} />
          </TouchableOpacity>
        )}

        {/* Resume (paused/suspended) */}
        {isPaused && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary + "20" }]}
            onPress={handleResume}
            accessibilityRole="button"
            accessibilityLabel="Resume workflow"
          >
            <Ionicons name="play-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Run / Running indicator */}
        <TouchableOpacity
          style={[
            styles.runButton,
            {
              backgroundColor: isRunning ? colors.surface
                : isPaused ? colors.surface
                : colors.primary,
              borderColor: isRunning ? colors.primary
                : isPaused ? "#F59E0B"
                : colors.primary,
              borderWidth: isRunning || isPaused ? 2 : 0,
            },
          ]}
          onPress={isRunning || isPaused ? undefined : handleRun}
          disabled={isRunning || isPaused || chain.length === 0}
          activeOpacity={isRunning || isPaused ? 1 : 0.7}
          accessibilityRole="button"
          accessibilityLabel={isRunning ? "Running" : isPaused ? "Paused" : "Run workflow"}
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
          ) : isPaused ? (
            <Ionicons name="pause" size={20} color="#F59E0B" />
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
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
