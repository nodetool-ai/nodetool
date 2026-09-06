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

interface EventsField {
  type?: string;
  defaultItemProps?: { trigger?: string };
  arrayFields?: { pace?: { options?: Array<{ value?: string }> } };
}

const components = appConfig.components as Record<
  string,
  { label?: string; fields?: Record<string, EventsField> }
>;

const eventsField = (type: string): EventsField | undefined =>
  components[type].fields?.events;

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

  it("fires events on the trigger the catalog declares", () => {
    const fromConfig = Object.fromEntries(
      Object.keys(WIDGET_CATALOG).map((type) => [
        type,
        eventsField(type)?.defaultItemProps?.trigger
      ])
    );
    const fromCatalog = Object.fromEntries(
      Object.entries(WIDGET_CATALOG).map(([type, d]) => [type, d.trigger])
    );
    expect(fromConfig).toEqual(fromCatalog);
  });

  // `commits` is what makes `pace: "release"` meaningful, and the editor spells
  // it as whether the pacing select offers that option. Nothing else compared
  // the two, so a widget could claim a settled value the editor never offers.
  it("offers release pacing to exactly the committing widgets", () => {
    const fromConfig = Object.fromEntries(
      Object.keys(WIDGET_CATALOG).map((type) => [
        type,
        (eventsField(type)?.arrayFields?.pace?.options ?? []).some(
          (option) => option.value === "release"
        )
      ])
    );
    const fromCatalog = Object.fromEntries(
      Object.entries(WIDGET_CATALOG).map(([type, d]) => [
        type,
        d.trigger === "change" && Boolean(d.commits)
      ])
    );
    expect(fromConfig).toEqual(fromCatalog);
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
