import type { Workflow } from "../stores/ApiTypes";

/** Reference passed to from_example_name when copying a gallery template. */
export function exampleSeedRef(workflow: Workflow): string {
  if (workflow.id.toLowerCase().endsWith(".json")) {
    return workflow.id.replace(/\.json$/i, "");
  }
  return workflow.name;
}

export function examplePackageName(workflow: Workflow): string {
  return workflow.package_name ?? "nodetool-base";
}
