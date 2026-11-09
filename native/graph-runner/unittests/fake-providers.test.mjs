// Guest side of unittests/fake_providers.cpp. The host loads this bundle
// twice: once with HostOptions::fakeProviders and a package assets
// directory, once with neither. Real node bodies run against the context.
import "./context-env.mjs";
import "../guest/env/index.mjs";
import { Buffer } from "buffer";
import { GuestContext } from "../guest/host/context.mjs";
import { forkContext } from "../guest/subgraph-context.mjs";
import { loadMediaRefBytes } from "../guest/host/runtime.mjs";
import { TextToImageNode } from "@nodetool-ai/image-nodes/nodes/image";
import { ListGeneratorNode } from "@nodetool-ai/llm-nodes/nodes/generators";

// As the generated node module of the guest build installs it.
globalThis.Buffer ??= Buffer;

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

const model = (provider, type) => ({ type, provider, id: "fake-model", name: "Fake" });
const textToImage = (provider) =>
  new TextToImageNode({ prompt: "a lighthouse", model: model(provider, "image_model") }).process(new GuestContext());
const audio = (path) => loadMediaRefBytes({ type: "audio", uri: `package://nodetool-base/${path}` }, new GuestContext());
const fake = globalThis.__host.providers.fake();

if (fake) {
  // The embedder's provider and prediction grants are gone.
  check(!globalThis.__host.context.has("provider:fixture:open"), "provider grant dropped");
  check(!globalThis.__host.context.has("prediction:fixture:text_to_image"), "prediction grant dropped");
  check(!globalThis.__host.context.has("provider:fixture:jobs:start"), "provider job grant dropped");
  // Asynchronous grants are dropped too, so an attempt reaches no callback.
  for (const name of ["provider:fixture-async:open", "provider:fixture-async:generateMessage",
                      "provider:fixture-async:close", "prediction:fixture-async:text_to_image"]) {
    check(!globalThis.__host.context.has(name), `async grant ${name} dropped`);
    check(!globalThis.__host.context.isAsync(name), `async grant ${name} not async`);
    await rejects(() => globalThis.__host.context.callAsync(name, "{}"), "is not granted");
  }

  // A real image node completes with FakeProvider's 1x1 PNG.
  const png = async (provider) => {
    const { output } = await textToImage(provider);
    check(output.type === "image" && output.mimeType === "image/png", `image output: ${JSON.stringify(output)}`);
    return Buffer.from(output.data, "base64");
  };
  const bytes1 = await png("fake-gen");
  check(bytes1.length === 68 && bytes1[1] === 0x50 && bytes1[2] === 0x4e, "fake PNG bytes");
  // A granted provider id resolves to a fake too, and the grant is not called.
  check((await png("fixture")).length === 68, "granted id is faked");
  check((await png("fixture-async")).length === 68, "an asynchronously granted id is faked");
  const asyncResult = await new GuestContext().runProviderPrediction({ provider: "fixture-async", capability: "generate_embedding", model: "m", params: { text: ["ab"], dimensions: 3 } });
  check(JSON.stringify(asyncResult) === "[[0.2,0.3,0.4]]", `fake embedding: ${JSON.stringify(asyncResult)}`);
  const result = await new GuestContext().runProviderPrediction({ provider: "fixture", capability: "generate_embedding", model: "m", params: { text: ["ab"], dimensions: 3 } });
  check(JSON.stringify(result) === "[[0.2,0.3,0.4]]", `fake embedding: ${JSON.stringify(result)}`);
  await rejects(
    () => new GuestContext().callProviderEndpoint({ provider: "fixture", capability: "text_to_image", model: "m", input: {} }),
    "does not support endpoint calls"
  );

  // One FakeProvider per id, shared with forked subgraph contexts.
  const context = new GuestContext();
  const a = await context.getProvider("fake-a");
  check(a.provider === "fake", "FakeProvider");
  check(a === (await context.getProvider("fake-a")), "cached per id");
  check(a !== (await context.getProvider("fake-b")), "one instance per id");
  await (await forkContext(context).getProvider("fake-c")).generateMessage({ messages: [], model: "m" });
  check((await context.getProvider("fake-c")).callCount === 1, "shared with forks");

  // Tool calls come once per instance, so two list nodes need two ids.
  const items = async (provider) => {
    const node = new ListGeneratorNode({ prompt: "three fruit", model: model(provider, "language_model") });
    const out = [];
    for await (const step of node.genProcess(context)) if (typeof step.item === "string") out.push(step.item);
    return out;
  };
  const first = await items("fake-list-1");
  check(first.length === 3 && first[0] === "fake item 1", `list items: ${JSON.stringify(first)}`);
  check((await items("fake-list-2")).length === 3, "second id gets its own burst");

  // package:// reads from the granted directory, inside it only.
  const bytes = await audio("recipe-inputs/voice.wav");
  check(new TextDecoder().decode(bytes) === "RIFF-fixture", "package asset bytes");
  await rejects(() => audio("../outside.txt"), "Invalid storage key");
  await rejects(() => audio("recipe-inputs/../../outside.txt"), "Invalid storage key");
  await rejects(() => audio("link.wav"), "EACCES");
  await rejects(() => audio("recipe-inputs/missing.wav"), "Package asset not found");
  globalThis.__fakeProvidersResult = "fake:ok";
} else {
  // Without the flag, provider calls go to the embedder's grants as before.
  check(globalThis.__host.context.has("prediction:fixture:text_to_image"), "prediction grant kept");
  check(globalThis.__host.context.isAsync("prediction:fixture-async:text_to_image"), "async prediction grant kept");
  // The context's services take the asynchronous transport for it. Loading
  // has no running graph, so the call fails there, before the callback.
  await rejects(
    () => new GuestContext().runProviderPrediction({ provider: "fixture-async", capability: "text_to_image", model: "m", params: {} }),
    "Asynchronous context calls need a running graph"
  );
  await rejects(() => textToImage("fake-gen"), "'prediction:fake-gen:text_to_image' is not granted");
  await rejects(() => new GuestContext().getProvider("fake-a"), "provider 'fake-a' is not granted");
  check(
    (await new GuestContext().runProviderPrediction({ provider: "fixture", capability: "text_to_image", model: "m", params: {} })) === "host",
    "granted prediction reaches the host"
  );
  await rejects(() => audio("recipe-inputs/voice.wav"), "no package assets directory (--package-assets)");
  globalThis.__fakeProvidersResult = "real:ok";
}
// Guest::load expects the guest protocol object. This bundle has no nodes.
globalThis.__nodetool = {};
