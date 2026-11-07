import { hostResponse, installFetch } from "./fetch.mjs";
import { installCryptoGlobals } from "./crypto.mjs";
// Only explicitly supplied callbacks are reachable. There is no provider registry,
// database singleton, process environment or credential fallback in this module.
import { PERMISSION_GATE_CONTEXT_KEY } from "guest-real:@nodetool-ai/runtime/permission-gate.js";
import { BaseProvider } from "guest-real:@nodetool-ai/runtime/providers/base-provider.js";
import { fromJson, toJson } from "../values.mjs";

export function contextCall(context, name, args) {
  context.signal.throwIfAborted();
  const host = globalThis.__host?.context;
  if (!host?.has(name))
    throw new Error(`ProcessingContext service '${name}' is not granted`);
  return Promise.resolve(host.call(name, toJson(args))).then((value) => {
    context.signal.throwIfAborted();
    return fromJson(value);
  });
}

export class ContextAbortSignal {
  constructor() {
    this.aborted = false;
    this.reason = undefined;
    this.listeners = new Map();
  }
  addEventListener(name, listener, options) {
    if (name === "abort") this.listeners.set(listener, options?.once === true);
  }
  removeEventListener(name, listener) {
    if (name === "abort") this.listeners.delete(listener);
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
  static abort(reason) {
    const controller = new ContextAbortController();
    controller.abort(reason);
    return controller.signal;
  }
  static any(signals) {
    const controller = new ContextAbortController(),
      subscriptions = [];
    const abort = (signal) => {
      controller.abort(signal.reason);
      for (const [other, listener] of subscriptions)
        other.removeEventListener("abort", listener);
    };
    for (const signal of signals) {
      if (signal.aborted) {
        abort(signal);
        break;
      }
      const listener = () => abort(signal);
      subscriptions.push([signal, listener]);
      signal.addEventListener("abort", listener, { once: true });
    }
    return controller.signal;
  }
  static timeout(ms) {
    const controller = new ContextAbortController();
    setTimeout(() => controller.abort(new Error("Operation timed out")), ms);
    return controller.signal;
  }
}
export class ContextAbortController {
  constructor() {
    this.signal = new ContextAbortSignal();
  }
  abort(reason = new Error("Run cancelled")) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    for (const [listener, once] of this.signal.listeners) {
      if (once) this.signal.listeners.delete(listener);
      try {
        const event = { type: "abort", target: this.signal };
        if (typeof listener === "function") listener.call(this.signal, event);
        else listener.handleEvent(event);
      } catch {
        /* One observer cannot prevent cancellation of the other operations. */
      }
    }
  }
}

globalThis.AbortController ??= ContextAbortController;
globalThis.AbortSignal ??= ContextAbortSignal;
installCryptoGlobals();
installFetch();

export function hostSignal() {
  const controller = new ContextAbortController();
  const listeners = new Set();
  let timer;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const poll = () => {
    if (globalThis.__host?.context?.aborted() && !controller.signal.aborted) {
      stop();
      controller.abort(new Error("Run cancelled"));
    }
  };
  return {
    get aborted() {
      poll();
      return controller.signal.aborted;
    },
    get reason() {
      poll();
      return controller.signal.reason;
    },
    addEventListener(name, listener, options) {
      poll();
      controller.signal.addEventListener(name, listener, options);
      if (name === "abort" && !controller.signal.aborted) {
        listeners.add(listener);
        timer ??= setInterval(poll, 10);
      }
    },
    removeEventListener(name, listener) {
      controller.signal.removeEventListener(name, listener);
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    },
    throwIfAborted() {
      poll();
      controller.signal.throwIfAborted();
    }
  };
}

export function nativeProvider(context, provider) {
  const invoke = (method, args) =>
    contextCall(context, `provider:${provider}:${method}`, args);
  const adapter = Object.assign(new BaseProvider(provider), {
    provider,
    async *generateMessages(args) {
      // Cursor operations preserve incremental delivery and let the embedding
      // adapter release in-flight model work when the consumer stops early.
      const cursor = await invoke("open", args);
      try {
        for (;;) {
          const item = await invoke("next", { cursor });
          if (item.done) return;
          yield item.value;
        }
      } finally {
        const host = globalThis.__host?.context;
        // Cleanup must run even after cancellation.
        if (host?.has(`provider:${provider}:close`))
          host.call(`provider:${provider}:close`, toJson({ cursor }));
      }
    },
    generateMessage: (args) => invoke("generateMessage", args),
    generateText: (args) => invoke("generateText", args),
    generateObject: (args) => invoke("generateObject", args),
    async postModel(model, method, body, signal = context.signal) {
      signal?.throwIfAborted();
      const result = await invoke("postModel", { model, method, body });
      signal?.throwIfAborted();
      return hostResponse(result);
    },
    async getVideoOperation(model, operationName, signal = context.signal) {
      signal?.throwIfAborted();
      const result = await invoke("getVideoOperation", {
        model,
        operationName
      });
      signal?.throwIfAborted();
      return hostResponse(result);
    },
    mediaHeaders: (uri) => invoke("mediaHeaders", { uri })
  });
  const host = globalThis.__host.context;
  if (host.has(`provider:${provider}:webSearch`))
    adapter.webSearch = (args) => invoke("webSearch", args);
  Object.defineProperty(adapter, "supportsNativeWebSearch", {
    get: () =>
      host.has(`provider:${provider}:metadata`) &&
      fromJson(host.call(`provider:${provider}:metadata`, "{}"))
        .supportsNativeWebSearch === true
  });
  return adapter;
}

function guardedProvider(context, provider) {
  const wrappers = new Map();
  return new Proxy(provider, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (
        typeof value !== "function" ||
        ![
          "generateMessages",
          "generateMessagesTraced",
          "generateLoop",
          "generateMessage",
          "generateMessageTraced",
          "generateObject",
          "generateText",
          "webSearch"
        ].includes(key)
      )
        return value;
      if (!wrappers.has(key)) {
        const streaming = [
          "generateMessages",
          "generateMessagesTraced",
          "generateLoop"
        ].includes(key);
        const invoke = (args) =>
          value.call(target, {
            ...args,
            signal: args?.signal ?? context.signal
          });
        wrappers.set(
          key,
          streaming
            ? async function* (args) {
                context.signal.throwIfAborted();
                for await (const item of invoke(args)) {
                  context.signal.throwIfAborted();
                  yield item;
                }
                context.signal.throwIfAborted();
              }
            : async (args) => {
                context.signal.throwIfAborted();
                const result = await invoke(args);
                context.signal.throwIfAborted();
                return result;
              }
        );
      }
      return wrappers.get(key);
    }
  });
}

export class ContextServices {
  initializeNativePermissions() {
    if (!globalThis.__host?.context?.has("permission:request")) return;
    this.set(PERMISSION_GATE_CONTEXT_KEY, {
      mode: "default",
      sessionAllow: new Set(),
      requestApproval: async (request) => {
        const decision = await contextCall(this, "permission:request", {
          ...request,
          userId: this.userId,
          jobId: this.jobId
        });
        if (!["allow", "allow_for_chat", "deny"].includes(decision))
          throw new TypeError("Invalid native tool permission decision");
        return decision;
      }
    });
  }
  setProviderResolver(resolver) {
    this._providerResolver = resolver;
  }
  get hasProviderResolver() {
    return this._providerResolver !== null || !!globalThis.__host?.context;
  }
  registerProvider(id, provider) {
    this._providers.set(id, guardedProvider(this, provider));
  }
  async getProvider(id) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("providerId is required");
    this.signal.throwIfAborted();
    if (this._providers.has(id)) return this._providers.get(id);
    if (this._providerPromises.has(id)) return this._providerPromises.get(id);
    const pending = (async () => {
      const provider = this._providerResolver
        ? await this._providerResolver(id)
        : [
              "open",
              "generateMessage",
              "generateText",
              "generateObject",
              "postModel",
              "webSearch"
            ].some((method) =>
              globalThis.__host?.context?.has(`provider:${id}:${method}`)
            )
          ? nativeProvider(this, id)
          : null;
      this.signal.throwIfAborted();
      if (!provider)
        throw new Error(`ProcessingContext provider '${id}' is not granted`);
      provider.setMessageEmitter?.((message) => this.postMessage(message));
      const scoped = guardedProvider(this, provider);
      this._providers.set(id, scoped);
      return scoped;
    })();
    this._providerPromises.set(id, pending);
    try {
      return await pending;
    } finally {
      this._providerPromises.delete(id);
    }
  }
  async isProviderConfigured(id) {
    return (
      this._providers.has(id) ||
      !!this._providerResolver ||
      !!globalThis.__host?.context?.has(`provider:${id}:open`)
    );
  }
  setInjectedTools(tools) {
    this._injectedTools = [...tools];
  }
  getInjectedTool(name) {
    return this._injectedTools.find((tool) => tool.name === name) ?? null;
  }
  setSendControlEvent(fn) {
    this._sendControlEvent = fn;
  }
  get hasControlEventSupport() {
    return this._sendControlEvent !== null;
  }
  async sendControlEvent(id, properties) {
    this.signal.throwIfAborted();
    return this._sendControlEvent
      ? this._sendControlEvent(id, properties)
      : null;
  }
  setModelInterfaces(interfaces) {
    this._modelInterfaces = interfaces;
  }
  hasModelInterface(name) {
    return (
      typeof this._modelInterfaces?.[name] === "function" ||
      !!globalThis.__host?.context?.has(`model:${name}`)
    );
  }
  async _callModel(name, args) {
    this.signal.throwIfAborted();
    const scoped = { ...args, userId: this.userId };
    const fn = this._modelInterfaces?.[name];
    const result = fn
      ? await fn(scoped)
      : await contextCall(this, `model:${name}`, scoped);
    this.signal.throwIfAborted();
    return result;
  }
  async getSetting(key) {
    const value = this.hasModelInterface("getSetting")
      ? await this._callModel("getSetting", { key })
      : null;
    return value || this.environment[key] || null;
  }
  createMessage(req) {
    return this._callModel("createMessage", { req });
  }
  getThreadMessages(threadId, limit, startKey, reverse) {
    return this._callModel("getMessages", {
      threadId,
      limit,
      startKey,
      reverse
    });
  }
  getJob(jobId) {
    return this._callModel("getJob", { jobId });
  }
  getScript(id) {
    return this._callModel("getScript", { id });
  }
  createScript(args) {
    return this._callModel("createScript", args);
  }
  updateScript(id, args) {
    return this._callModel("updateScript", { ...args, id });
  }
  getStoryboard(id) {
    return this._callModel("getStoryboard", { id });
  }
  listStoryboards(args = {}) {
    return this._callModel("listStoryboards", args);
  }
  findRecastStoryboard(args) {
    return this._callModel("findRecastStoryboard", args);
  }
  createStoryboard(args) {
    return this._callModel("createStoryboard", args);
  }
  updateStoryboard(id, args) {
    return this._callModel("updateStoryboard", { ...args, id });
  }
  getImageDocument(id) {
    return this._callModel("getImageDocument", { id });
  }
  createImageDocument(args) {
    return this._callModel("createImageDocument", args);
  }
  getTimelineSequence(id) {
    return this._callModel("getTimelineSequence", { id });
  }
  createTimelineSequence(sequence) {
    return this._callModel("createTimelineSequence", { sequence });
  }
  updateTimelineSequence(id, sequence) {
    return this._callModel("updateTimelineSequence", { id, sequence });
  }
  listEntities(args = {}) {
    return this._callModel("listEntities", args);
  }
  getEntity(id) {
    return this._callModel("getEntity", { id });
  }
  upsertEntity(args) {
    return this._callModel("upsertEntity", args);
  }
  updateAssetBytes(args) {
    return this._callModel("updateAssetBytes", args);
  }
  listFolderAssets(folderId) {
    return this._callModel("listFolderAssets", { folderId });
  }
  async runProviderPrediction(req) {
    if (req.capability === "generate_message") {
      const provider = await this.getProvider(req.provider);
      const params = req.params ?? {};
      const args = {
        messages: params.messages ?? [],
        model: req.model,
        tools: params.tools,
        toolChoice: params.tool_choice,
        maxTokens: params.max_tokens,
        temperature: params.temperature,
        topP: params.top_p,
        presencePenalty: params.presence_penalty,
        frequencyPenalty: params.frequency_penalty,
        signal: this.signal
      };
      const generate =
        provider.generateMessageTraced ?? provider.generateMessage;
      const result = await generate.call(provider, args);
      this.signal.throwIfAborted();
      return result;
    }
    // Host generation adapters own capability-specific media conversion and
    // bookkeeping. Do not return raw provider bytes as a successful generation.
    return contextCall(
      this,
      `prediction:${req.provider}:${req.capability}`,
      req
    );
  }
  async *streamProviderPrediction(req) {
    const provider = await this.getProvider(req.provider);
    if (req.capability !== "generate_messages")
      throw new Error(
        `Streaming capability '${req.capability}' is not granted`
      );
    yield* provider.generateMessages({
      ...req.params,
      model: req.model,
      signal: this.signal
    });
  }
  emit(message) {
    this.postMessage(message);
  }
  postMessage(message) {
    this.signal.throwIfAborted();
    this._messages.push(message);
    if (message.type === "node_update" && message.node_id)
      this._nodeStatuses.set(message.node_id, message);
    if (message.type === "edge_update" && message.edge_id)
      this._edgeStatuses.set(message.edge_id, message);
    for (const listener of this._messageListeners) {
      try {
        listener(message);
      } catch {
        /* Observers cannot stop the run. */
      }
    }
    const host = globalThis.__host?.context;
    if (host?.has("message")) host.call("message", toJson(message));
  }
  addMessageListener(listener) {
    this._messageListeners.add(listener);
    return () => this.removeMessageListener(listener);
  }
  removeMessageListener(listener) {
    this._messageListeners.delete(listener);
  }
  setProviderCost(provider, amount, unit = "USD", extra = {}) {
    this._providerCost = { provider, amount, unit, ...extra };
  }
  getMessages() {
    return [...this._messages];
  }
  hasMessages() {
    return this._messages.length > 0;
  }
  popMessage() {
    return this._messages.shift();
  }
  clearMessages() {
    this._messages.length = 0;
  }
  getNodeStatuses() {
    return Object.fromEntries(this._nodeStatuses);
  }
  getEdgeStatuses() {
    return Object.fromEntries(this._edgeStatuses);
  }
  async popMessageAsync() {
    if (this.hasMessages()) return this.popMessage();
    return new Promise((resolve, reject) => {
      const dispose = this.addMessageListener(() => {
        cleanup();
        resolve(this.popMessage());
      });
      const abort = () => {
        cleanup();
        reject(this.signal.reason);
      };
      const cleanup = () => {
        dispose();
        this.signal.removeEventListener("abort", abort);
      };
      this.signal.addEventListener("abort", abort, { once: true });
      if (this.signal.aborted) abort();
    });
  }
  getProviderCost() {
    return this._providerCost;
  }
  clearProviderCost() {
    this._providerCost = null;
  }
  async sleep(ms, signal = this.signal) {
    signal.throwIfAborted();
    if (!Number.isFinite(ms) || ms < 0)
      throw new RangeError("Invalid sleep duration");
    await new Promise((resolve, reject) => {
      const done = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(done, ms);
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
  }
}
