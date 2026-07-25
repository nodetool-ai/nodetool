/** @jsxImportSource @emotion/react */
/**
 * Renders one template's mini app with seeded demo values for marketing
 * screenshots. Loads /app-preview/<slug>.json, resolves $demo media tokens
 * (image → the template's card art; video/audio → client-generated clips),
 * seeds an AppRuntimeStore, and mounts the real Puck widget tree — the exact
 * pixels a user sees in the Mini App runtime, minus the backend.
 *
 * Sets data-preview-ready="true" on the frame once every image and video has
 * decoded, which the screenshot script waits for.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Render, type Data } from "@puckeditor/core";
import { ThemeProvider, CssBaseline } from "@mui/material";

import ThemeNodetool from "../components/themes/ThemeNodetool";
import {
  DEFAULT_OPERATION_ID,
  implicitOperation,
  namespaceOf,
  parseBinding,
  stateKey,
  type AppInstanceState,
  type PuckData
} from "@nodetool-ai/app-runtime";

import { createAppRuntimeStore } from "../components/appbuilder/runtime/appRuntimeStore";
import {
  AppRuntimeContext,
  type AppRuntimeContextValue
} from "../components/appbuilder/runtime/AppRuntimeContext";
import { appConfig } from "../components/appbuilder/puck/config";
import { extractWorkflowIO } from "../components/appbuilder/workflowIO";
import { Workflow } from "../stores/ApiTypes";
import { Box, BORDER_RADIUS } from "../components/ui_primitives";
import { makeDemoAudio, makeDemoGradient, makeDemoVideo } from "./demoMedia";

interface PreviewBundle {
  slug: string;
  name: string;
  image: string | null;
  app_doc: { ui: PuckData };
  /** The template's Input/Output nodes — the surface bindings resolve against. */
  graph: Workflow["graph"];
  /** Keyed by the same binding token the widgets carry (`op:main/out:<id>`). */
  values: Record<string, unknown>;
}

const isToken = (v: unknown, kind: string): boolean =>
  typeof v === "object" && v !== null && (v as Record<string, unknown>).$demo === kind;

async function resolveDemoValues(bundle: PreviewBundle): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};
  const art = bundle.image ?? makeDemoGradient(bundle.name);
  let video: string | null | undefined;
  for (const [key, value] of Object.entries(bundle.values)) {
    if (isToken(value, "image")) {
      resolved[key] = art;
    } else if (isToken(value, "audio")) {
      resolved[key] = makeDemoAudio();
    } else if (isToken(value, "video")) {
      if (video === undefined) {
        video = art ? await makeDemoVideo(art) : null;
      }
      resolved[key] = video ?? "";
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Turn binding-keyed demo values into the state slots the widgets read. The
 * bundle ships no run, but an ID-form binding token parses on its own — so each
 * value lands in the same namespace a real run would fill.
 */
function seedState(values: Record<string, unknown>): Partial<AppInstanceState> {
  const inputs: AppInstanceState["inputs"] = {};
  const outputs: AppInstanceState["outputs"] = {};
  const variables: AppInstanceState["variables"] = {};
  for (const [binding, value] of Object.entries(values)) {
    const ref = parseBinding(binding);
    if (!ref) continue;
    const key = stateKey(ref);
    switch (namespaceOf(ref)) {
      case "outputs":
        outputs[key] = {
          value,
          invocationId: null,
          status: "done",
          revision: 1
        };
        break;
      case "inputs":
        inputs[key] = { value, dirty: false, revision: 1 };
        break;
      case "variables":
        variables[key] = value;
        break;
      default:
        break;
    }
  }
  return { inputs, outputs, variables };
}

/** Resolves when every <img> and <video> inside `el` has decoded a frame. */
async function mediaSettled(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  const videos = [...el.querySelectorAll("video")];
  await Promise.all([
    ...images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))),
    ...videos.map(
      (v) =>
        new Promise<void>((resolveVideo) => {
          if (v.readyState >= 2) return resolveVideo();
          v.addEventListener("loadeddata", () => resolveVideo(), { once: true });
          setTimeout(resolveVideo, 4000);
        })
    )
  ]);
  await document.fonts.ready;
}

const AppPreviewApp: React.FC = () => {
  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get("slug") ?? "",
    []
  );
  const [bundle, setBundle] = useState<PreviewBundle | null>(null);
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Missing ?slug=<template-slug>");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/app-preview/${slug}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PreviewBundle;
        const resolved = await resolveDemoValues(data);
        if (cancelled) return;
        setBundle(data);
        setValues(resolved);
      } catch (e) {
        if (!cancelled) setError(`Failed to load preview bundle: ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Demo values are keyed by the same binding token the widgets carry, so each
  // one seeds the state slot a real run would fill — the real widgets then
  // render the real values with no backend.
  const store = useMemo(
    () => (values ? createAppRuntimeStore(seedState(values)) : null),
    [values]
  );

  // The bundle ships its Input/Output nodes, which is what a WorkflowInput
  // widget needs to render the control for its node's type.
  const io = useMemo(
    () => extractWorkflowIO(bundle ? ({ graph: bundle.graph } as Workflow) : null),
    [bundle]
  );

  const runtime = useMemo(
    (): AppRuntimeContextValue | null =>
      store && values
        ? {
            store,
            io,
            scope: {
              defaultOperationId: DEFAULT_OPERATION_ID,
              operations: [
                {
                  operationId: DEFAULT_OPERATION_ID,
                  inputs: io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
                  outputs: io.outputs.map(({ nodeId, name }) => ({
                    nodeId,
                    name
                  })),
                  nodeIds: io.inputs
                    .map((i) => i.nodeId)
                    .concat(io.outputs.map((o) => o.nodeId))
                }
              ],
              variables: []
            },
            operation: implicitOperation(""),
            resources: [],
            designMode: false,
            dispatch: () => {},
            write: () => {},
            selectResource: () => {},
            getNodeProperty: () => undefined
          }
        : null,
    [io, store, values]
  );

  // Signal readiness for the screenshot script once media has decoded.
  useEffect(() => {
    if (!runtime || !frameRef.current) return;
    let cancelled = false;
    void mediaSettled(frameRef.current).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  // The apps carry their own emoji heading; the plain root title would render
  // twice in the marketing frame.
  const data = useMemo((): Data | null => {
    if (!bundle) return null;
    const d = bundle.app_doc.ui;
    return {
      ...d,
      root: { ...d.root, props: { ...d.root?.props, title: "" } }
    } as Data;
  }, [bundle]);

  if (error) {
    return <pre data-preview-error="true">{error}</pre>;
  }
  if (!bundle || !runtime || !data) return null;

  return (
    <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
      <CssBaseline />
      <AppRuntimeContext.Provider value={runtime}>
        <Box
          ref={frameRef}
          className="app-preview-frame"
          data-preview-ready={ready ? "true" : "false"}
          sx={{
            width: 980,
            mx: "auto",
            my: 4,
            borderRadius: BORDER_RADIUS.lg,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
            backgroundColor: "background.default",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45)"
          }}
        >
          <Render config={appConfig} data={data} />
        </Box>
      </AppRuntimeContext.Provider>
    </ThemeProvider>
  );
};

export default AppPreviewApp;
