import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface AppComponent {
  type: string;
  props: {
    content?: AppComponent[];
    events?: Array<{ kind: string; operationId?: string; trigger: string }>;
    left?: AppComponent[];
    right?: AppComponent[];
    title?: string;
    [key: string]: unknown;
  };
}

interface AdMakerBundle {
  app: {
    ui: { content: AppComponent[] };
    operations: Array<{
      id: string;
      inputs: Record<string, { variableId?: string }>;
      timeoutMs?: number;
    }>;
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_FILE = path.resolve(
  __dirname,
  "../nodetool/examples/apps/ad-maker.app.json"
);

function loadApp(): AdMakerBundle {
  return JSON.parse(fs.readFileSync(APP_FILE, "utf8")) as AdMakerBundle;
}

function flatten(components: AppComponent[]): AppComponent[] {
  return components.flatMap((component) => [
    component,
    ...flatten(component.props.content ?? []),
    ...flatten(component.props.left ?? []),
    ...flatten(component.props.right ?? [])
  ]);
}

describe("Ad Maker app", () => {
  it("keeps writing and paid image generation in separate guided stages", () => {
    const bundle = loadApp();
    const components = flatten(bundle.app.ui.content);
    const sectionTitles = components
      .map((component) => component.props.title)
      .filter((title): title is string => typeof title === "string");

    expect(sectionTitles).toContain("1 · Settle the message");
    expect(sectionTitles).toContain("2 · Direct the campaign image");

    const buttons = components.filter(
      (component) => component.type === "Button"
    );
    const operationIds = buttons.map((button) =>
      (button.props.events ?? [])
        .filter((event) => event.kind === "run")
        .map((event) => event.operationId)
    );

    expect(operationIds).toEqual([
      ["copy", "headlines"],
      ["visual"]
    ]);

    expect(
      components
        .filter((component) => component.type === "ModelSelect")
        .map((component) => [component.props.label, component.props.binding])
    ).toEqual([
      ["Writing model", "op:copy/prop:ag#model"],
      ["Headline model", "op:headlines/prop:ag#model"],
      ["Prompt-writing model", "op:visual/prop:ag#model"],
      ["Image model", "op:visual/prop:gen#model"]
    ]);

    const visual = bundle.app.operations.find(
      (operation) => operation.id === "visual"
    );
    expect(visual?.inputs.in?.variableId).toBe("visualBrief");
    expect(visual?.timeoutMs).toBe(600_000);
  });
});
