/**
 * Layout invariants that a screenshot can't state and a device-only prop can't
 * show: one shared width per table column, a shrinkable label next to a
 * fixed-size control, and nested scrolling on the inner scrollers that sit
 * inside the app's own ScrollView (Android needs the prop to deliver the pan).
 */
import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({
      job_id: null,
      run: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    }),
    subscribe: () => () => {},
  }),
}));

import { webSocketService } from "../../../services/WebSocketService";

// The real socket singleton; only `subscribe` is stubbed so nothing dials out.
jest.spyOn(webSocketService, "subscribe").mockReturnValue(() => {});

import { apiService } from "../../../services/api";

// The real `apiService` singleton, with only the two host-dependent lookups
// pinned so URLs are stable regardless of the configured API host.
jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");

import ApplicationAppView from "../ApplicationAppView";

const appDoc = (
  widget: { type: string; props: Record<string, unknown> },
  value: unknown
) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Probe" } },
    content: [{ type: widget.type, props: { binding: "var:v", ...widget.props } }],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-layout",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [
    { id: "v", name: "v", scope: "instance", persist: false, default: value },
  ],
});

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Probe",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const renderApp = (
  id: string,
  widget: { type: string; props: Record<string, unknown> },
  value: unknown
) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(appDoc(widget, value)) as ApplicationDocument}
      workflow={makeWorkflow(id)}
    />
  );

const widthOf = (text: string): number | undefined => {
  const style = StyleSheet.flatten(screen.getByText(text).props.style) as {
    width?: number;
  };
  return style.width;
};

describe("widget layout invariants", () => {
  it("gives a table column one width, shared by its header and its cells", async () => {
    // The header is short where the data is long, and long where it is short:
    // sized per cell, the two rows would settle at different widths.
    renderApp("wf-widths", { type: "Table", props: { id: "t" } }, [
      { id: "a-considerably-longer-cell-value", verbose_column_header: "x" },
    ]);

    await screen.findByText("id");
    expect(widthOf("id")).toBe(widthOf("a-considerably-longer-cell-value"));
    expect(widthOf("verbose_column_header")).toBe(widthOf("x"));
    // Distinct content still yields distinct columns, not one uniform width.
    expect(widthOf("id")).not.toBe(widthOf("verbose_column_header"));
  });

  it("lets a switch label shrink instead of pushing the control off the edge", async () => {
    renderApp(
      "wf-switch",
      {
        type: "Switch",
        props: { id: "s", label: "Enable high-resolution upscaling" },
      },
      true
    );

    const label = await screen.findByText("Enable high-resolution upscaling");
    const style = StyleSheet.flatten(label.props.style) as { flex?: number };
    expect(style.flex).toBe(1);
    expect(label.props.numberOfLines).toBe(2);
  });

  it("enables nested scrolling on the chat thread's inner scroller", async () => {
    renderApp(
      "wf-chat",
      { type: "ChatThread", props: { id: "c", maxHeight: 360 } },
      [{ role: "user", content: "hello" }]
    );

    await screen.findByText("hello");
    const capped = screen.UNSAFE_getAllByType(ScrollView).filter((node) => {
      const style = StyleSheet.flatten(node.props.style) as {
        maxHeight?: number;
      };
      return style?.maxHeight === 360;
    });
    expect(capped).toHaveLength(1);
    expect(capped[0].props.nestedScrollEnabled).toBe(true);
  });
});
