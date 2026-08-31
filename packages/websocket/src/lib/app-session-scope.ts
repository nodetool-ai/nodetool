/**
 * What a websocket connection opened by a deployed app's visitor may do.
 *
 * The connection authenticates as the app's owner (see the `nda_` token in
 * `@nodetool-ai/auth`), so on the wire it looks like any other session. It is
 * not one: the person holding it was given a link to one app, and the account
 * behind it is a stranger's. Everything below is written as an allowlist for
 * that reason — a command added to the runner later is refused here until
 * someone decides it belongs, rather than reaching a stranger's account
 * because nobody remembered this file.
 *
 * Two rules, and they are separate on purpose. Which *commands* are allowed is
 * a fixed set. Which *graph* a run executes is not a matter of trust at all:
 * the client's graph is discarded and the release's pinned graph is
 * substituted, so a visitor who edits the payload runs the same thing as one
 * who does not.
 */

// Type-only, so this does not close a runtime cycle with the runner that
// imports the functions below. The runner declares its own `RunJobRequest`
// (a superset of the protocol's), and confining a run means producing exactly
// the shape it will act on.
import type { RunJobRequest } from "../websocket-client-session.js";

/** The app this connection may act on, and the release it loaded. */
export interface AppSessionScope {
  applicationId: string;
  version: number;
}

/**
 * Just enough of a release to decide what a visitor may run: which version
 * they are running, and the graph each of its workflows was frozen to. Named
 * here rather than imported so this module depends on the two fields it
 * actually reads — a stored graph arrives as JSON either way.
 */
export interface RunnableRelease {
  version: number;
  document: {
    operations: ReadonlyArray<{
      id: string;
      name: string;
      workflowId: string;
      target?: { kind: "workflow" | "script" };
    }>;
  };
  workflows: ReadonlyArray<{
    workflowId: string;
    graph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    } | null;
  }>;
}

/**
 * The commands a deployed app needs: start a run, feed it, stop it, and see
 * where it got to. Everything else the runner answers — chat, inference,
 * asset and workflow listings, node metadata writes, model management — reads
 * or spends the owner's account beyond the one app, so none of it is here.
 *
 * `reconnect_job` is included because a reload mid-run is ordinary use, and it
 * only replays a job this connection's user owns.
 */
export const APP_SESSION_COMMANDS: ReadonlySet<string> = new Set([
  "run_job",
  "reconnect_job",
  "cancel_job",
  "stream_input",
  "end_input_stream",
  "get_status"
]);

export function isAppSessionCommandAllowed(command: string): boolean {
  return APP_SESSION_COMMANDS.has(command);
}

/** A run this connection may not make, and the reason to send back. */
export interface AppSessionRunRefusal {
  refused: string;
}

export function isRunRefusal(
  result: RunJobRequest | AppSessionRunRefusal
): result is AppSessionRunRefusal {
  return "refused" in result;
}

/**
 * Rewrite a visitor's run request into the only run it is allowed to make.
 *
 * Built field by field rather than by spreading the request, for the same
 * reason the command set is an allowlist: a field added to `RunJobRequest`
 * later must not reach a stranger's account because nobody remembered this
 * file. What a visitor gets to say is what an app *is* — which operation to
 * run, and what to run it on:
 *
 *   `params`        the inputs. Supplying them is the whole point.
 *   `operation_id`  which published workflow operation to run.
 *
 * Everything else the wire carries is the server's. `job_id` names the run so
 * the client can follow it, and the runner refuses one that is already taken.
 * `workflow_id`, `job_name`, and `application_id` come
 * from the signed session and `application_version` from the release, so a
 * visitor cannot bill a run to another app or file it under a version that
 * never shipped. `graph` comes from the release, so what runs is what the
 * owner published — a client that sends a wider graph, or one with an
 * exfiltrating node in it, gets the published graph instead. `supervise` is
 * dropped because it puts a second model on the owner's bill;
 * `execution_options`, `concurrent`, `auth_token` and `user_id` are dropped
 * because none of them is a visitor's to set.
 */
export function confineRunRequest(
  req: RunJobRequest,
  scope: AppSessionScope,
  release: RunnableRelease
): RunJobRequest | AppSessionRunRefusal {
  const operationId = req.operation_id;
  if (!operationId) {
    return { refused: "This app run did not name an operation" };
  }
  const operation = release.document.operations.find(
    (entry) => entry.id === operationId
  );
  if (!operation) {
    return { refused: "This app does not publish that operation" };
  }
  if (operation.target?.kind === "script" || !operation.workflowId) {
    return { refused: "This app operation is not a workflow" };
  }
  const pinned = release.workflows.find(
    (entry) => entry.workflowId === operation.workflowId
  );
  if (!pinned?.graph) {
    return { refused: "This app does not publish that workflow" };
  }
  return {
    workflow_id: operation.workflowId,
    job_name: operation.name,
    params: req.params,
    operation_id: operation.id,
    application_id: scope.applicationId,
    application_version: release.version,
    graph: pinned.graph
  };
}
