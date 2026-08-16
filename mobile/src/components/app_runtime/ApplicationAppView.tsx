/**
 * Renders an application document as a runnable mini app.
 *
 * The document is the app — the same one the web App Builder authors, stored
 * on the application resource and fetched over `/api/applications/*`. Mobile
 * renders it with native widgets; it does not edit it (Puck is a DOM editor).
 * The workflow is what the document's operations run against.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import { useTheme } from "../../hooks/useTheme";
import type { ApplicationRunIdentity } from "../../hooks/useApplications";
import type { Workflow } from "../../types/workflow";
import { AppRuntimeContext } from "./AppRuntimeContext";
import { useAppRuntime } from "./useAppRuntime";
import { useRuntimeSelector } from "./AppRuntimeContext";
import { ComponentList, type ComponentNode } from "./widgets";

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
      if (!invocation?.error) {
        continue;
      }
      if (!latest || invocation.startedAt > latest.startedAt) {
        latest = { startedAt: invocation.startedAt, error: invocation.error };
      }
    }
    return latest?.error;
  });
  if (!error) {
    return null;
  }
  return (
    <View
      style={[
        styles.errorBanner,
        {
          backgroundColor: `${colors.error}12`,
          borderColor: `${colors.error}30`
        }
      ]}
    >
      <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
    </View>
  );
};

interface ApplicationAppViewProps {
  document: ApplicationDocument;
  /** Keys this app's instance state, so two apps never share values. */
  applicationId?: string;
  /** The workflow the document's operations run. */
  workflow: Workflow;
  /**
   * Release identity sent with every run, so the server can meter it against
   * the app's budget. Absent only where no application backs the document.
   */
  application?: ApplicationRunIdentity;
  /** Falls back to the app's name when the document's root has no title. */
  title?: string;
}

const ApplicationAppView: React.FC<ApplicationAppViewProps> = ({
  document,
  applicationId,
  workflow,
  application,
  title
}) => {
  const { colors } = useTheme();
  const runtimeOptions: Parameters<typeof useAppRuntime>[1] = { document };
  if (applicationId) {
    runtimeOptions.instanceKey = applicationId;
  }
  if (application) {
    runtimeOptions.application = application;
  }
  const runtime = useAppRuntime(workflow, runtimeOptions);

  const heading = String(document.ui.root.props?.title ?? title ?? "");
  const content = document.ui.content as ComponentNode[];

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {heading ? (
          <Text style={[styles.title, { color: colors.text }]}>{heading}</Text>
        ) : null}
        <RuntimeError />
        <ComponentList nodes={content} />
      </ScrollView>
    </AppRuntimeContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4
  },
  errorBanner: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600"
  }
});

export default ApplicationAppView;
