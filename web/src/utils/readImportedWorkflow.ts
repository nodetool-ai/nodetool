import type { WorkflowGraph, WorkflowRequest } from "../stores/ApiTypes";
import { isBoolean, isNumber, isObjectLike, isString } from "./typePredicates";

type WorkflowSettings = NonNullable<WorkflowRequest["settings"]>;

const isSettingsRecord = (value: unknown): value is WorkflowSettings =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (entry) =>
      entry === null ||
      isString(entry) ||
      isNumber(entry) ||
      isBoolean(entry)
  );

// The file is whatever the user picked, so a field that isn't the shape it
// claims is dropped rather than handed to the server.
export const readImportedWorkflow = (
  text: string
): Pick<
  WorkflowRequest,
  "name" | "description" | "graph" | "tags" | "settings" | "run_mode" | "html_app"
> => {
  const parsed: unknown = JSON.parse(text);
  if (!isObjectLike(parsed)) {
    throw new Error("Workflow file must contain a JSON object");
  }
  const source = parsed as Record<string, unknown>;
  const graph = source.graph;
  const isGraph =
    typeof graph === "object" &&
    graph !== null &&
    Array.isArray((graph as WorkflowGraph).nodes) &&
    Array.isArray((graph as WorkflowGraph).edges);

  const asString = (value: unknown): string | undefined =>
    isString(value) ? value : undefined;

  return {
    name: asString(source.name) ?? "",
    description: asString(source.description),
    graph: isGraph ? (graph as WorkflowGraph) : undefined,
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    settings: isSettingsRecord(source.settings) ? source.settings : undefined,
    run_mode: asString(source.run_mode),
    html_app: asString(source.html_app)
  };
};
