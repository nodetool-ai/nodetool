/**
 * Widget settings in the shipped example apps that no run can catch.
 *
 * A `pace: "release"` run fires only when its widget commits (slider release,
 * text blur). A widget that never commits would leave the run unsent while the
 * event's other actions still apply.
 *
 * A number widget whose range reaches past its input node's min or max offers
 * values the node clamps, so 1 quote card silently becomes 2 paid renders.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { WIDGET_CATALOG } from "../src/widgets.js";

const APPS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool/examples/apps"
);

interface Placed {
  type?: unknown;
  props?: {
    id?: unknown;
    events?: unknown;
    binding?: unknown;
    label?: unknown;
    min?: unknown;
    max?: unknown;
  };
}

interface Bundle {
  app?: { ui?: unknown; operations?: Array<{ id: string; workflowId?: string }> };
  workflows?: Array<{
    key: string;
    graph: { nodes: Array<{ id: string; data?: Record<string, unknown> }> };
  }>;
}

const loadBundles = (): Array<[string, Bundle]> => {
  const files = readdirSync(APPS_DIR).filter((f) => f.endsWith(".app.json"));
  expect(files.length).toBeGreaterThan(0);
  return files.map((file) => [
    file,
    JSON.parse(readFileSync(resolve(APPS_DIR, file), "utf8")) as Bundle
  ]);
};

const placedWidgets = (value: unknown, out: Placed[] = []): Placed[] => {
  if (Array.isArray(value)) {
    for (const item of value) placedWidgets(item, out);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.type === "string" && record.props) out.push(record);
    for (const child of Object.values(record)) placedWidgets(child, out);
  }
  return out;
};

describe("shipped example apps", () => {
  it("only release-pace events on widgets that commit", () => {
    const offenders: string[] = [];
    let releaseEvents = 0;
    for (const [file, bundle] of loadBundles()) {
      for (const widget of placedWidgets(bundle.app?.ui)) {
        const events = Array.isArray(widget.props?.events)
          ? widget.props.events
          : [];
        for (const event of events as Array<{ pace?: string }>) {
          if (event.pace !== "release") continue;
          releaseEvents += 1;
          const spec =
            WIDGET_CATALOG[String(widget.type) as keyof typeof WIDGET_CATALOG];
          if (!spec?.commits) {
            offenders.push(`${file}: ${String(widget.type)} ${String(widget.props?.id)}`);
          }
        }
      }
    }
    expect(releaseEvents).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("keeps number widgets inside their input node's range", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const [file, bundle] of loadBundles()) {
      const graphs = new Map(
        (bundle.workflows ?? []).map((w) => [w.key, w.graph])
      );
      for (const widget of placedWidgets(bundle.app?.ui)) {
        const props = widget.props ?? {};
        const match = /^op:([^/]+)\/in:(.+)$/.exec(String(props.binding ?? ""));
        if (!match) continue;
        const operation = bundle.app?.operations?.find((o) => o.id === match[1]);
        const node = graphs
          .get(operation?.workflowId ?? "")
          ?.nodes.find((n) => n.id === match[2]);
        const data = node?.data ?? {};
        const below =
          typeof props.min === "number" &&
          typeof data.min === "number" &&
          props.min < data.min;
        const above =
          typeof props.max === "number" &&
          typeof data.max === "number" &&
          props.max > data.max;
        if (typeof props.min === "number" || typeof props.max === "number") {
          checked += 1;
        }
        if (below || above) {
          offenders.push(
            `${file}: ${String(props.label)} ${String(props.min)}..${String(props.max)}, node ${String(data.min)}..${String(data.max)}`
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
