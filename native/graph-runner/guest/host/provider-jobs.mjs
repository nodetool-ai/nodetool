// Provider endpoint calls run as host jobs (include/nodetool/provider_jobs.h),
// so a vendor call that takes minutes never blocks the runner thread. The
// guest starts a job, awaits each of its items through the asynchronous
// `next` grant, which settles when the host has one, and closes the job when
// it settles or is aborted. The host files the job under the run in
// progress. Requests and results larger than one part travel as consecutive
// parts of their JSON text.
import { fromJson, toJson } from "../values.mjs";
import { fakeProvidersGranted } from "./fake-providers.mjs";

// Characters of request JSON per put. Well under the host's part and payload
// limits after the text is escaped again inside the put request.
const PART_CHARS = 128 * 1024;

const operation = (provider, name) => `provider:${provider}:jobs:${name}`;

/** True when the embedder granted endpoint jobs for `provider`, and providers are not fake. */
export function hasProviderJobs(provider) {
  return !fakeProvidersGranted() && globalThis.__host?.context?.has(operation(provider, "start")) === true;
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/**
 * Run one provider method (callEndpoint, uploadMedia or downloadMedia) as a
 * host job and return its result. `onProgress` receives each progress event.
 * `signal` is checked before each item. The run's own cancellation rejects a
 * waiting `next` through the host. A caller's signal (`signal.caller`, see
 * runSignal in context-services.mjs) gets an abort listener that closes the
 * job, so a waiting `next` ends at once. The listener is removed when the
 * call ends.
 */
export async function runProviderJob({ provider, method, args, signal, onProgress }) {
  const host = globalThis.__host?.context;
  if (!host?.has(operation(provider, "start"))) {
    throw new Error(`Provider '${provider}' endpoint calls are not granted`);
  }
  // A cancellation (an AbortError) becomes the abort's reason. Any other
  // error, such as the provider's own, stays what it is.
  const asAbort = (error) => {
    if (error?.name === "AbortError") signal?.throwIfAborted();
    throw error;
  };
  const call = (name, text) => {
    try {
      return host.call(operation(provider, name), text);
    } catch (error) {
      asAbort(error);
    }
  };
  signal?.throwIfAborted();

  const request = toJson(args ?? {});
  let started;
  if (request.length <= PART_CHARS) {
    started = call("start", `{"method":${JSON.stringify(method)},"args":${request}}`);
  } else {
    let upload = null;
    for (let offset = 0; offset < request.length; offset += PART_CHARS) {
      const data = request.slice(offset, offset + PART_CHARS);
      upload = JSON.parse(call("put", JSON.stringify({ upload, data }))).upload;
    }
    started = call("start", JSON.stringify({ method, upload }));
  }
  const { job } = JSON.parse(started);
  const payload = JSON.stringify({ job });
  // Closing cancels a call that is still running and is idempotent. The
  // context lets ":close" through after the run is cancelled.
  const close = () => call("close", payload);
  const caller = signal?.caller;
  caller?.addEventListener?.("abort", close);

  try {
    const parts = [];
    for (;;) {
      signal?.throwIfAborted();
      let reply;
      try {
        reply = await host.callAsync(operation(provider, "next"), payload);
      } catch (error) {
        asAbort(error);
      }
      const answer = fromJson(reply);
      switch (answer.state) {
        case "progress":
          onProgress?.(answer.event);
          break;
        case "part":
          parts.push(answer.data);
          break;
        case "done":
          return "value" in answer ? answer.value : fromJson(parts.join(""));
        case "stopped":
          signal?.throwIfAborted();
          throw abortError(answer.message);
        default:
          throw new Error(`Unknown provider job state '${answer.state}'`);
      }
    }
  } finally {
    caller?.removeEventListener?.("abort", close);
    close();
  }
}
