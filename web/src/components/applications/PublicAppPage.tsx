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
/** A stable deployment URL can point at a newly published release. */
const PUBLIC_APPLICATION_STALE_TIME = 30_000;
/**
 * Re-read the app on a slow timer. Two things go stale otherwise: the release
 * the owner publishes under the same URL, and the signed URLs the response
 * carries for the app's static media.
 */
const PUBLIC_APPLICATION_REFRESH_MS = 30 * 60 * 1000;

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

/** The owner published while this page was open; a reload picks it up. */
const Updated: React.FC = () => (
  <FlexColumn
    align="center"
    justify="center"
    gap={SPACING.md}
    sx={{ height: "100vh", px: SPACING.lg }}
  >
    <EmptyState
      variant="empty"
      title="This app has been updated"
      description="Reload the page to run the version the owner just published."
    />
  </FlexColumn>
);

const PublicAppPage: React.FC = () => {
  const { token = "" } = useParams<{ token?: string }>();
  const [sessionReady, setSessionReady] = useState(false);

  const {
    data: app,
    isLoading,
    isError,
    refetch: refetchApp
  } = useQuery({
    queryKey: ["public-application", token],
    queryFn: () => fetchPublicApplication(token),
    enabled: token !== "",
    staleTime: PUBLIC_APPLICATION_STALE_TIME,
    retry: false,
    refetchInterval: PUBLIC_APPLICATION_REFRESH_MS,
    refetchOnWindowFocus: false
  });

  const {
    data: session,
    isError: isSessionError
  } = useQuery({
    queryKey: ["public-application", token, "session", app?.release.version],
    queryFn: () => createPublicAppSession(token),
    enabled: app !== undefined,
    staleTime: SESSION_REFRESH_MS,
    retry: false,
    refetchInterval: SESSION_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false
  });

  // The session names the release the server would run. When that is not the
  // release this page loaded, the owner published while the page was open: the
  // page is stale, not broken, and re-reading the app is what recovers it.
  const sessionVersionMismatch =
    session !== undefined && session.version !== app?.release.version;

  useEffect(() => {
    if (sessionVersionMismatch) void refetchApp();
  }, [refetchApp, sessionVersionMismatch]);

  // The query owns session fetching and refresh. This effect only makes a
  // validated result available to the websocket layer, then clears it when
  // the result changes or the public page unmounts.
  useEffect(() => {
    if (!app || !session || isSessionError || sessionVersionMismatch) {
      setAppSessionToken(null);
      setSessionReady(false);
      return;
    }

    setAppSessionToken(session.token);
    setSessionReady(true);
    return () => {
      setAppSessionToken(null);
      setSessionReady(false);
    };
  }, [app, isSessionError, session, sessionVersionMismatch]);

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

  if (isError || isSessionError || !app || !document_ || !workflow) {
    return <Unavailable />;
  }

  if (sessionVersionMismatch) return <Updated />;

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
