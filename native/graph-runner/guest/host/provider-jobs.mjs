// Provider endpoint calls run as host jobs (include/nodetool/provider_jobs.h),
// so a vendor call that takes minutes never blocks the runner thread. The
// guest starts a job, polls it on a timer so other nodes keep running, and
// closes it when it settles or the run is aborted. Requests and results
// larger than one part travel as consecutive parts of their JSON text.
import { fromJson, toJson } from "../values.mjs";
import { fakeProvidersGranted } from "./fake-providers.mjs";

// Characters of request JSON per put. Well under the host's part and payload
// limits after the text is escaped again inside the put request.
const PART_CHARS = 128 * 1024;
const FIRST_DELAY_MS = 10;
const MAX_DELAY_MS = 500;

const operation = (provider, name) => `provider:${provider}:jobs:${name}`;

/** True when the embedder granted endpoint jobs for `provider`, and providers are not fake. */
export function hasProviderJobs(provider) {
  return !fakeProvidersGranted() && globalThis.__host?.context?.has(operation(provider, "start")) === true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one provider method (callEndpoint, uploadMedia or downloadMedia) as a
 * host job and return its result. `run` is the job id of the workflow run,
 * which the host uses to release the job when the run ends. `onProgress`
 * receives each progress event.
 */
export async function runProviderJob({ provider, run = "", method, args, signal, onProgress }) {
  const host = globalThis.__host?.context;
  if (!host?.has(operation(provider, "start"))) {
    throw new Error(`Provider '${provider}' endpoint calls are not granted`);
  }
  const call = (name, text) => host.call(operation(provider, name), text);
  signal?.throwIfAborted();

  const request = toJson(args ?? {});
  let started;
  if (request.length <= PART_CHARS) {
    started = call("start", `{"run":${JSON.stringify(run)},"method":${JSON.stringify(method)},"args":${request}}`);
  } else {
    let upload = null;
    for (let offset = 0; offset < request.length; offset += PART_CHARS) {
      const data = request.slice(offset, offset + PART_CHARS);
      upload = JSON.parse(call("put", JSON.stringify({ run, upload, data }))).upload;
    }
    started = call("start", JSON.stringify({ run, method, upload }));
  }
  const { job } = JSON.parse(started);

  try {
    const parts = [];
    let delay = FIRST_DELAY_MS;
    for (;;) {
      signal?.throwIfAborted();
      const answer = fromJson(call("poll", JSON.stringify({ job })));
      switch (answer.state) {
        case "progress":
          onProgress?.(answer.event);
          delay = FIRST_DELAY_MS;
          break;
        case "part":
          parts.push(answer.data);
          break;
        case "done":
          return "value" in answer ? answer.value : fromJson(parts.join(""));
        case "error":
          throw new Error(answer.message);
        case "pending":
          await sleep(delay);
          delay = Math.min(delay * 2, MAX_DELAY_MS);
          break;
        default:
          throw new Error(`Unknown provider job state '${answer.state}'`);
      }
    }
  } finally {
    // Closing cancels a call that is still running. The context lets ":close"
    // through after the run is cancelled.
    call("close", JSON.stringify({ job }));
  }
}
