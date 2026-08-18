/** @jsxImportSource @emotion/react */
/**
 * DocDemoPlayer — renders a document surface and its assistant dock for a
 * {@link DocDemoCast} at a given time. Third player in the harness, after
 * `../DemoPlayer.tsx` (graph) and `../timeline/TimelineDemoPlayer.tsx`
 * (timeline), and the one that covers the remaining five document types.
 *
 * The document is the production component in every case — the sketch editor's
 * own toolbar/layers/status chrome around `SketchRenderer`, `ScriptDocumentPane`,
 * `StoryboardBoard`, `JsScriptEditorPane`, `AppRuntimeView` — driven as a pure
 * function of elapsed time. It deliberately mounts the document surface only,
 * not each editor's page shell: those wire up autosave, tRPC-backed loading,
 * and generation subscriptions, none of which apply to a backend-free,
 * hand-authored cast.
 *
 * The surfaces are read-only here for the same reason the graph canvas is: a
 * replay renders state, it never accepts input.
 */
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Data } from "@puckeditor/core";
import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { MemoryRouter } from "react-router-dom";

import "../../styles/vars.css";
import "../../styles/base.css";
import "../../styles/markdown/nodetool-markdown.css";
import "../../styles/markdown/github-markdown.css";

import ThemeNodetool from "../../components/themes/ThemeNodetool";
import AppRuntimeView from "../../components/appbuilder/AppRuntimeView";
import JsScriptEditorPane from "../../components/jsScript/JsScriptEditorPane";
import ScriptDocumentPane from "../../components/script/ScriptDocumentPane";
import { StoryboardBoard } from "../../components/storyboard/StoryboardBoard";
import { SketchEditorSurface } from "./SketchEditorSurface";
import { WorkflowManagerProvider } from "../../contexts/WorkflowManagerContext";
import { queryClient } from "../../queryClient";
import { TRPCProvider } from "../../trpc/Provider";
import {
  AssistantDock,
  ASSISTANT_DOCK_WIDTH_PX
} from "../assistant/AssistantDock";
import { seedDemoAuth, seedDemoSecrets } from "../demoEngine";
import { useMediaReadiness, type PendingMediaHandler } from "../mediaReadiness";
import type {
  AppCastDoc,
  DocDemoCast,
  SketchDocCast
} from "./docCastTypes";
import { disposeDocState, docStateAt, seedDocState } from "./docReplay";

/** Renders the production component for the cast's surface. */
function DocSurfaceView({
  cast,
  doc
}: {
  cast: DocDemoCast;
  doc: DocDemoCast["doc"];
}): React.JSX.Element {
  switch (cast.surface) {
    case "sketch":
      return (
        <SketchEditorSurface
          documentId={cast.docId}
          doc={doc as SketchDocCast["doc"]}
          ariaLabel={cast.name}
        />
      );
    case "script":
      return <ScriptDocumentPane scriptId={cast.docId} readOnly />;
    case "storyboard":
      return <StoryboardBoard boardId={cast.docId} readOnly />;
    case "jsscript":
      return <JsScriptEditorPane scriptId={cast.docId} readOnly />;
    case "app": {
      const app = doc as AppCastDoc;
      return (
        <AppRuntimeView
          workflow={app.workflow}
          data={app.document.ui as Data}
          document={app.document}
        />
      );
    }
  }
}

export interface DocDemoPlayerProps {
  cast: DocDemoCast;
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  /** Width of the assistant dock in px. Pass 0 to hide it. */
  assistantWidthPx?: number;
  /** Called with a promise per not-yet-decoded video so a frame renderer can
   *  block the capture until media is paintable (see ../mediaReadiness.ts). */
  onPendingMedia?: PendingMediaHandler;
  style?: React.CSSProperties;
}

/** Self-contained document surface. `timeMs` may change every frame. */
export function DocDemoPlayer({
  cast,
  timeMs,
  assistantWidthPx = ASSISTANT_DOCK_WIDTH_PX,
  onPendingMedia,
  style
}: DocDemoPlayerProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  useMediaReadiness(rootRef, timeMs, onPendingMedia);

  // The document surfaces read the same globals the graph canvas does: shot
  // cards and asset views throw with no user, and model pickers flash an
  // "API key missing" banner mid-replay with no secrets.
  useState(() => {
    seedDemoAuth();
    seedDemoSecrets();
  });

  const doc = useMemo(() => docStateAt(cast, timeMs), [cast, timeMs]);

  // Seed synchronously before paint so each frame's DOM reflects exactly the
  // cast state at `timeMs`, the same way the other two players seek.
  useLayoutEffect(() => {
    seedDocState(cast, doc);
  }, [cast, doc]);

  useEffect(() => () => disposeDocState(cast), [cast]);

  return (
    // Several surfaces call react-router hooks (navigation to a linked script,
    // timeline, or asset); a MemoryRouter supplies the Router context.
    <MemoryRouter>
      <TRPCProvider>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <InitColorSchemeScript attribute="class" defaultMode="dark" />
          <CssBaseline />
          <WorkflowManagerProvider queryClient={queryClient}>
            <div
              ref={rootRef}
              data-demo-player
              data-doc-surface={cast.surface}
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                ...style
              }}
            >
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <DocSurfaceView cast={cast} doc={doc} />
              </div>
              {assistantWidthPx > 0 && (
                <AssistantDock
                  events={cast.assistant}
                  timeMs={timeMs}
                  title={cast.assistantTitle}
                  model={cast.assistantModel}
                  style={{ width: assistantWidthPx, flexShrink: 0 }}
                />
              )}
            </div>
          </WorkflowManagerProvider>
        </ThemeProvider>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default DocDemoPlayer;
