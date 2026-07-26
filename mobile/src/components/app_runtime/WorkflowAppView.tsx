/**
 * Renders a workflow as a runnable mini app.
 *
 * The saved `workflow.app_doc` is the app when there is one — the same document
 * the web App Builder authors, rendered with native widgets. A workflow without
 * one falls back to a document generated from its Input/Output nodes, so every
 * workflow stays runnable on the phone.
 */
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  isRenderableUi,
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import { useTheme } from "../../hooks/useTheme";
import type { Workflow } from "../../types/workflow";
import { AppRuntimeContext } from "./AppRuntimeContext";
import { useAppRuntime } from "./useAppRuntime";
import { useRuntimeSelector } from "./AppRuntimeContext";
import { ComponentList, type ComponentNode } from "./widgets";
import { generateAppDoc } from "./generateAppDoc";

/** The saved document, or one generated from the graph. */
export const resolveAppDocument = (
  workflow: Workflow
): ApplicationDocument => {
  const saved =
    workflow.app_doc && typeof workflow.app_doc === "object"
      ? parseApplicationDocument(workflow.app_doc, {
          hostWorkflowId: workflow.id,
        })
      : null;
  return saved && isRenderableUi(saved.ui) ? saved : generateAppDoc(workflow);
};

/**
 * Surfaces the active invocation's error above the app. Errors belong to an
 * invocation, so the next run replaces the banner.
 */
const RuntimeError: React.FC = () => {
  const { colors } = useTheme();
  // With several operations the banner belongs to whichever of their active
  // runs failed most recently.
  const error = useRuntimeSelector((s) => {
    let latest: { startedAt: number; error: string } | undefined;
    for (const invocationId of Object.values(s.activeInvocation)) {
      const invocation = s.invocations[invocationId];
      if (!invocation?.error) {continue;}
      if (!latest || invocation.startedAt > latest.startedAt) {
        latest = { startedAt: invocation.startedAt, error: invocation.error };
      }
    }
    return latest?.error;
  });
  if (!error) {return null;}
  return (
    <View
      style={[
        styles.errorBanner,
        { backgroundColor: `${colors.error}12`, borderColor: `${colors.error}30` },
      ]}
    >
      <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
    </View>
  );
};

interface WorkflowAppViewProps {
  workflow: Workflow;
}

const WorkflowAppView: React.FC<WorkflowAppViewProps> = ({ workflow }) => {
  const { colors } = useTheme();
  const document = useMemo(() => resolveAppDocument(workflow), [workflow]);
  const runtime = useAppRuntime(workflow, { document });

  const title = String(document.ui.root.props?.title ?? workflow.name ?? "");
  const content = document.ui.content as ComponentNode[];

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {title ? (
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        ) : null}
        <RuntimeError />
        <ComponentList nodes={content} />
      </ScrollView>
    </AppRuntimeContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  errorBanner: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default WorkflowAppView;
