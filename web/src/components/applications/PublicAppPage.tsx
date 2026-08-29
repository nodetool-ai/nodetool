/**
 * A deployed mini app, rendered for someone with the link and no account.
 *
 * Everything it needs arrives in one unauthenticated response: the app's name
 * and its released snapshot, pinned graphs included. Nothing here fetches a
 * workflow, a script, or a setting — the session token this page runs on
 * reaches the websocket and nothing else, so a page that needed a second
 * authenticated call would simply not work. Passing every pinned graph as a
 * `workflowOverrides` entry is what makes that true.
 *
 * The session is short-lived and refreshed on a timer. The websocket layer
 * re-reads it on every reconnect, so a refresh costs nothing and a run in
 * flight is undisturbed.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";
import { APP_DEPLOYMENT_SESSION_TTL_SECONDS } from "@nodetool-ai/protocol";
import type { PublicApplication } from "@nodetool-ai/protocol/api-schemas/applications.js";

import { Workflow } from "../../stores/ApiTypes";
import { setAppSessionToken } from "../../lib/appSession";
import {
  Caption,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING,
  Text
} from "../ui_primitives";
import { parseApplicationDocument, type AppDocument } from "../appbuilder/appData";
import AppRuntimeView from "../appbuilder/AppRuntimeView";
import {
  createPublicAppSession,
  fetchPublicApplication
} from "./publicAppClient";

/** Re-mint with a margin, so a session never lapses between two runs. */
const SESSION_REFRESH_MS = (APP_DEPLOYMENT_SESSION_TTL_SECONDS - 300) * 1000;

/** A release's pinned graph, as it arrives over the wire. */
type PinnedGraph = PublicApplication["release"]["workflows"][number]["graph"];

/** A pinned graph, wrapped as the workflow shape the runtime and runner want. */
const pinnedWorkflow = (
  id: string,
  name: string,
  graph: PinnedGraph | Workflow["graph"]
): Workflow => ({
  id,
  name,
  description: "",
  // SAFETY: the release schema types a node's `dynamic_outputs` values as
  // `unknown` (the metadata schema is recursive and self-typed), where the
  // editor's graph type names them. The values are the same bytes either way —
  // both come from the stored graph — and the runtime reads them through the
  // node metadata, not through this type.
  graph: graph as Workflow["graph"],
  access: "private",
  created_at: "",
  updated_at: ""
});

const Unavailable: React.FC = () => (
  <FlexColumn
    align="center"
    justify="center"
    gap={SPACING.md}
    sx={{ height: "100vh", px: SPACING.lg }}
  >
    <EmptyState
      variant="error"
      title="This app is not available"
      description="The link may have been withdrawn, or the app may not be published."
    />
  </FlexColumn>
);

const PublicAppPage: React.FC = () => {
  const { token = "" } = useParams<{ token?: string }>();
  const [sessionReady, setSessionReady] = useState(false);

  const { data: app, isLoading, isError } = useQuery({
    queryKey: ["public-application", token],
    queryFn: () => fetchPublicApplication(token),
    enabled: token !== "",
    retry: false,
    refetchOnWindowFocus: false
  });

  // Mint the run session once the app resolves, and keep it fresh. Clearing on
  // unmount matters: the token authenticates as the app's owner, and nothing
  // outside this page should connect with it.
  useEffect(() => {
    if (!app) return;
    let active = true;
    const mint = async () => {
      try {
        const session = await createPublicAppSession(token);
        if (!active) return;
        setAppSessionToken(session.token);
        setSessionReady(true);
      } catch (error) {
        console.error("Failed to start an app session", error);
      }
    };
    void mint();
    const timer = window.setInterval(() => void mint(), SESSION_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      setAppSessionToken(null);
      setSessionReady(false);
    };
  }, [app, token]);

  useEffect(() => {
    if (app?.name) document.title = app.name;
  }, [app?.name]);

  const document_ = useMemo<AppDocument | null>(
    () => (app ? parseApplicationDocument(app.release.document) : null),
    [app]
  );

  const workflowOverrides = useMemo<Record<string, Workflow>>(() => {
    const overrides: Record<string, Workflow> = {};
    for (const pinned of app?.release.workflows ?? []) {
      if (!pinned.graph) continue;
      overrides[pinned.workflowId] = pinnedWorkflow(
        pinned.workflowId,
        app?.name ?? pinned.workflowId,
        pinned.graph
      );
    }
    return overrides;
  }, [app]);

  const hostWorkflowId = document_?.operations[0]?.workflowId ?? "";
  const workflow = useMemo<Workflow | undefined>(() => {
    const pinned = workflowOverrides[hostWorkflowId];
    if (pinned) return pinned;
    if (hostWorkflowId) return undefined;
    // An app need not run a workflow at all — widgets over variables and
    // static content are a whole app — but the runtime still wants a shape.
    return pinnedWorkflow(app?.id ?? "", app?.name ?? "", {
      nodes: [],
      edges: []
    });
  }, [app, hostWorkflowId, workflowOverrides]);

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" sx={{ height: "100vh" }}>
        <LoadingSpinner size="large" text="Loading app" />
      </FlexColumn>
    );
  }

  if (isError || !app || !document_ || !workflow) return <Unavailable />;

  if (document_.ui.content.length === 0) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        gap={SPACING.md}
        sx={{ height: "100vh", px: SPACING.lg }}
      >
        <EmptyState
          variant="empty"
          title="Nothing to show"
          description="This app was published without any widgets."
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn gap={0} fullWidth sx={{ height: "100vh", minHeight: 0 }}>
      <FlexColumn gap={0} sx={{ px: SPACING.lg, py: SPACING.md }}>
        <Text component="h1" size="big">
          {app.name}
        </Text>
        {app.description ? (
          <Caption color="secondary">{app.description}</Caption>
        ) : null}
      </FlexColumn>
      {sessionReady ? (
        <AppRuntimeView
          workflow={workflow}
          data={document_.ui as Data}
          document={document_}
          application={{ id: app.id, version: app.release.version }}
          workflowOverrides={workflowOverrides}
        />
      ) : (
        <LoadingSpinner size="large" text="Connecting" />
      )}
    </FlexColumn>
  );
};

export default PublicAppPage;
