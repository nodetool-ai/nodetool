// Guest side of unittests/provider_jobs.cpp: the context's endpoint methods
// over ProviderJobs.
import "./context-env.mjs";
import "../guest/env/index.mjs";
import { ContextAbortController } from "../guest/host/context-services.mjs";
import { GuestContext } from "../guest/host/context.mjs";

function check(value, message) {
  if (!value) throw new Error(message);
}
async function rejects(fn, text) {
  try {
    await fn();
  } catch (error) {
    check(String(error).includes(text), `Expected "${text}", got: ${error}`);
    return;
  }
  throw new Error(`Expected rejection: ${text}`);
}

const context = new GuestContext();

// An endpoint call with progress, bytes in the input and vendor metadata.
const events = [];
const result = await context.callProviderEndpoint({
  provider: "fixture",
  capability: "text_to_image",
  model: "m1",
  input: { prompt: "a lighthouse", image: new Uint8Array([1, 2, 3]) },
  route: "image",
  nodeId: "node-1",
  onProgress: (event) => events.push(event)
});
check(result.requestId === "req-1", "request id");
check(result.metadata.credits === 3, "metadata");
check(result.output.model === "m1" && result.output.route === "image", "model and route");
check(result.output.capability === "text_to_image" && result.output.nodeId === "node-1", "capability and node id");
check(result.output.echo.prompt === "a lighthouse", "input JSON");
check(result.output.echo.image instanceof Uint8Array && result.output.echo.image.join() === "1,2,3", "input bytes");
check(events.length === 2 && events[0].message === "queued" && events[1].progress === 0.75, "progress events");

// A request and a result each larger than one part.
const large = await context.callProviderEndpoint({
  provider: "fixture",
  capability: "text_to_video",
  model: "large",
  input: { blob: new Uint8Array(1536 * 1024).fill(7) }
});
check(large.output.inputChars > 2 * 1024 * 1024, "large request arrived whole");
check(large.output.padding.length === 3 * 1024 * 1024, "large result reassembled");
check(large.output.text === "Grüße", "multibyte text survives part boundaries");
check(large.requestId === null, "null request id");

// Uploads and downloads.
const url = await context.uploadProviderMedia({
  provider: "fixture",
  bytes: new Uint8Array(10),
  mimeType: "image/png"
});
check(url.startsWith("https://cdn.fixture.invalid/upload/") && url.endsWith("/image/png"), "upload URL");
const bytes = await context.downloadProviderMedia({
  provider: "fixture",
  url: "https://cdn.fixture.invalid/result.bin"
});
check(bytes instanceof Uint8Array && new TextDecoder().decode(bytes) === "abc", "downloaded bytes");

// A vendor error reaches the node.
await rejects(
  () => context.callProviderEndpoint({ provider: "fixture", capability: "text_to_image", model: "fail", input: {} }),
  "vendor refused the request"
);

// A provider with neither jobs nor a resolver.
await rejects(
  () => context.callProviderEndpoint({ provider: "other", capability: "text_to_image", model: "m", input: {} }),
  "provider 'other' is not granted"
);

// Aborting cancels the running call on the host.
const controller = new ContextAbortController();
setTimeout(() => controller.abort(new Error("stopped by user")), 50);
await rejects(
  () => context.callProviderEndpoint({
    provider: "fixture",
    capability: "text_to_image",
    model: "slow",
    input: {},
    signal: controller.signal
  }),
  "stopped by user"
);

// Two calls run at the same time, and timers keep firing while they wait.
let ticks = 0;
const ticker = setInterval(() => ticks++, 10);
const both = await Promise.all([
  context.callProviderEndpoint({ provider: "fixture", capability: "text_to_image", model: "concurrent", input: {} }),
  context.callProviderEndpoint({ provider: "fixture", capability: "text_to_image", model: "concurrent", input: {} })
]);
clearInterval(ticker);
check(both.every((entry) => entry.output.model === "concurrent"), "concurrent results");
check(ticks >= 5, `timers ran while calls were pending (${ticks} ticks)`);

globalThis.__providerJobsResult = "ok";
// Guest::load expects the guest protocol object. This bundle has no nodes.
globalThis.__nodetool = {};
