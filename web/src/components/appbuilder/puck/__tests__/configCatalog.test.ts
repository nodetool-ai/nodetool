/**
 * The Puck config and the shared widget catalog describe the same components.
 *
 * `WIDGET_CATALOG` is what the CLI `app debug` harness, the mobile renderer and
 * the headless `app-tools` bridge read; this config is what the editor renders.
 * When they drift, an agent is offered widgets the editor cannot place — or
 * places widgets the harness rejects as unknown. This test is the only thing
 * holding the two together, so it compares them field by field.
 */
import { WIDGET_CATALOG, widgetFields } from "@nodetool-ai/app-runtime";

import { appConfig } from "../config";

const components = appConfig.components as Record<
  string,
  { label?: string; fields?: Record<string, { type?: string }> }
>;

const fieldKinds = (type: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(components[type].fields ?? {}).map(([name, field]) => [
      name,
      field?.type ?? "unknown"
    ])
  );

describe("Puck config ↔ widget catalog", () => {
  it("offers exactly the widget types the catalog declares", () => {
    expect(Object.keys(components).sort()).toEqual(
      Object.keys(WIDGET_CATALOG).sort()
    );
  });

  it("puts every component in a palette category", () => {
    const categorized = Object.values(appConfig.categories ?? {}).flatMap(
      (category) => category?.components ?? []
    );
    expect([...categorized].sort()).toEqual(Object.keys(components).sort());
  });

  it.each(Object.keys(WIDGET_CATALOG))("matches the catalog for %s", (type) => {
    expect(components[type].label).toBe(WIDGET_CATALOG[type].label);
    expect(fieldKinds(type)).toEqual(widgetFields(type));
  });

  it("declares each layout widget's slots as slot fields", () => {
    for (const [type, descriptor] of Object.entries(WIDGET_CATALOG)) {
      const slots = Object.entries(fieldKinds(type))
        .filter(([, kind]) => kind === "slot")
        .map(([name]) => name);
      expect(slots).toEqual([...(descriptor.slots ?? [])]);
    }
  });
});
