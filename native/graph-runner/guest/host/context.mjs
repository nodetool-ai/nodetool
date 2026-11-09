// The ProcessingContext node code receives in the native runner. Each member
// mirrors the one of the same name in packages/runtime/src/context.ts, with
// the host capabilities behind it:
//
//   workspace, workspaceDir      the `files` capability (HostOptions::workspaceDir)
//   storage                      in-memory temp store (memory:// URIs), as in a CLI run
//   assetStorage, createAsset    the `assets` capability (HostOptions::assetDir)
//   getSecret                    the `secrets` capability (HostOptions::secrets)
//   httpGet, downloadFile        the `http` capability (HostOptions::allowHttpFetch)
//
// Provider, tool and persistence interfaces are explicit per-run grants in
// ContextServices and models.mjs. No provider SDK or ambient database is opened.
import { fromJson } from "../values.mjs";
import { createGuestModels } from "./models.mjs";
import { ContextServices, hostSignal, contextCall } from "./context-services.mjs";
import { InMemoryStorageAdapter, hostAssetStorage } from "./storage.mjs";
import { hostWorkspace } from "./workspace.mjs";
import { VariableChannel } from "guest-real:@nodetool-ai/runtime/variable-channel.js";
import { CostLedger } from "guest-real:@nodetool-ai/runtime-core/cost-ledger";
import { extForImageMime, sniffImageMime } from "guest-real:@nodetool-ai/runtime/providers/image-mime.js";
import { isPackageAssetUri, parsePackageAssetUri } from "@nodetool-ai/protocol";
import { fakeProviderResolver, fakeProvidersGranted } from "./fake-providers.mjs";

const NEVER_ABORTED = {
  aborted: false,
  reason: undefined,
  addEventListener() {},
  removeEventListener() {},
  throwIfAborted() {}
};

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

function randomHex(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function randomUUID() {
  const h = randomHex(32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20)}`;
}

function base64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(text);
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export class MemoryCache {
  constructor() {
    this._store = new Map();
  }
  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expires !== null && Date.now() > entry.expires) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }
  async set(key, value, ttlSeconds) {
    this._store.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }
  async has(key) {
    return (await this.get(key)) !== undefined;
  }
  async delete(key) {
    this._store.delete(key);
  }
}

const ASSET_EXT = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
  "text/plain": "txt",
  "application/json": "json",
  "model/gltf-binary": "glb"
};

export class GuestContext extends ContextServices {
  constructor({ jobId = "job", workflowId = null, signal, providerResolver = null, modelInterfaces = null, injectedTools = [], onMessage, userId, environment, modelOptions, modelServices } = {}) {
    super();
    this._providerResolver = providerResolver ?? (fakeProvidersGranted() ? fakeProviderResolver() : null);
    this._providers = new Map();
    this._providerPromises = new Map();
    this._modelInterfaces = modelInterfaces;
    const nativeTools=JSON.parse(globalThis.__host?.context?.tools?.()??'[]');
    if(!Array.isArray(nativeTools))throw new Error('Native tool definitions must be an array');
    this._injectedTools = [...injectedTools,...nativeTools.map(tool=>{
      if(typeof tool.name!=='string' || !tool.name || !globalThis.__host.context.has(`tool:${tool.name}`))throw new Error('Native tool definition has no callback grant');
      return {...tool,process:(_context,args)=>contextCall(this,`tool:${tool.name}`,{userId:this.userId,jobId:this.jobId,args})};
    })];
    this._sendControlEvent = null;
    this._messageListeners = new Set(onMessage ? [onMessage] : []);
    this._providerCost = null;
    this._costs = new CostLedger();
    this._messages = [];
    this._nodeStatuses = new Map();
    this._edgeStatuses = new Map();
    this.jobId = jobId;
    this.workflowId = workflowId;
    this.threadId = null;
    this.projectId = null;
    this.userId = userId ?? globalThis.__host?.context?.userId?.() ?? "default";
    this.signal = signal ?? hostSignal();
    this.triggerEvent = null;
    // Agent activity code reads it before falling back to the ambient scope.
    // The native runner opens no run trace scope of its own.
    this.runTraceContext = null;
    this.assetOutputMode = "native";
    this.persistOutputAssets = true;
    this.environment = { ...(environment ?? JSON.parse(globalThis.__host?.context?.environment?.() ?? "{}")) };
    this.authToken = null;
    const moduleResolution=fromJson(globalThis.__host?.context?.modules?.()??'null');
    this.sandboxModuleCatalog = moduleResolution ? {
      resolveForExecution(requirements) {
        const requested=new Set(requirements.map(entry=>entry.specifier));
        const modules=moduleResolution.modules.filter(module=>requested.has(module.specifier));
        const found=new Set(modules.map(module=>module.specifier));
        return {modules,statuses:[...requested].filter(specifier=>!found.has(specifier)).map(specifier=>({status:'error',packName:specifier,message:`Module '${specifier}' is not granted`}))};
      }
    } : null;
    this.cache = new MemoryCache();
    this.storage = new InMemoryStorageAdapter();
    this.assetStorage = hostAssetStorage();
    const grantedModels = modelOptions ?? JSON.parse(globalThis.__host?.context?.modelOptions?.() ?? "{}");
    this._models = modelServices ?? createGuestModels({ ...grantedModels, userId: this.userId, assetStorage: this.assetStorage });
    this._modelInterfaces = { ...this._models.interfaces, ...modelInterfaces };
    this.workspaceStorage = null;
    this.workspace = hostWorkspace();
    this.workspaceDir = this.workspace?.localDir ?? null;
    this._variables = {};
    this._channels = new Map();
    this._channelWriters = new Map();
    this._resolvedSecrets = new Set();
    this._normalizedOutputAssets = new WeakMap();
    this.initializeNativePermissions();
  }

  // ------------------------------------------------------------- secrets

  get hasSecretResolver() {
    return true;
  }

  async getSecret(key) {
    const value = globalThis.__host?.secrets?.get(key) ?? null;
    if (value != null && value.length > 0) this._resolvedSecrets.add(value);
    return value;
  }

  getResolvedSecretValues() {
    return this._resolvedSecrets;
  }

  async getSecretRequired(key) {
    const value = await this.getSecret(key);
    if (value === null || value === "") throw new Error(`Missing required secret: ${key}`);
    return value;
  }

  // ----------------------------------------------------------- variables

  get(key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(this._variables, key) ? this._variables[key] : defaultValue;
  }

  set(key, value) {
    this._variables[key] = value;
  }

  hasVariable(key) {
    return Object.prototype.hasOwnProperty.call(this._variables, key);
  }

  getVariables() {
    return { ...this._variables };
  }

  async storeStepResult(key, value) {
    this._variables[key] = value;
    return "";
  }

  async loadStepResult(key, defaultValue) {
    return this.get(key, defaultValue);
  }

  registerChannelWriters(name, count) {
    this._channelWriters.set(name, (this._channelWriters.get(name) ?? 0) + count);
  }

  getChannel(name) {
    let channel = this._channels.get(name);
    if (!channel) {
      channel = new VariableChannel();
      this._channels.set(name, channel);
      if ((this._channelWriters.get(name) ?? 0) === 0) channel.close();
    }
    return channel;
  }

  markChannelWriterDone(name) {
    const remaining = (this._channelWriters.get(name) ?? 0) - 1;
    this._channelWriters.set(name, Math.max(0, remaining));
    if (remaining <= 0) this.getChannel(name).close();
  }

  closeAllChannels() {
    for (const channel of this._channels.values()) channel.close();
  }

  hasChannelWriters(name) {
    return (this._channelWriters.get(name) ?? 0) > 0;
  }

  // -------------------------------------------------------------- assets

  /**
   * Without an asset directory this fails as the TypeScript context does
   * without a database. With one, the bytes land at `<id>.<ext>` there.
   */
  async createAsset(args) {
    return this._callModel("createAsset", {
      ...args, content: args.content ?? args.instructions,
      workflowId: this.workflowId, jobId: this.jobId, projectId: this.projectId
    });
  }

  async getAssetInfo(assetId) {
    return this.hasModelInterface("getAssetInfo") ? this._callModel("getAssetInfo", {assetId}) : null;
  }

  async localPath(uri) {
    return this._models.repository ? this._models.localPath(uri) : null;
  }

  _assetAdapters() {
    return [this.assetStorage, this.storage].filter((a, i, all) => a !== null && all.indexOf(a) === i);
  }

  _parseAssetIdCandidates(assetId) {
    const trimmed = assetId.trim();
    if (!trimmed) return [];
    let raw = trimmed;
    if (raw.startsWith("asset://")) raw = raw.slice("asset://".length);
    else if (raw.startsWith("/api/storage/")) raw = raw.slice("/api/storage/".length);
    else if (raw.startsWith("api/storage/")) raw = raw.slice("api/storage/".length);
    const primary = raw.split(/[?#]/)[0];
    if (!primary) return [];
    const slash = primary.lastIndexOf("/");
    const dir = slash >= 0 ? primary.slice(0, slash + 1) : "";
    const last = slash >= 0 ? primary.slice(slash + 1) : primary;
    return Array.from(new Set([primary, dir + last.replace(/\.[^.]+$/, "")].filter(Boolean)));
  }

  _assetKeysFor(candidate) {
    const keys = [candidate, `assets/${candidate}`];
    if (this.userId && !candidate.startsWith(`${this.userId}/`)) keys.unshift(`${this.userId}/${candidate}`);
    return keys;
  }

  /**
   * Asset bytes from the asset and temp stores, by the keys the TypeScript
   * context tries. `package://<pkg>/<path>` reads <pkg>/<path> from the
   * package assets directory (HostOptions::packageAssetsDir), and fails when
   * none is granted or the file is missing. The HTTP fallbacks to a NodeTool
   * server are not available.
   */
  async resolveAssetBytes(assetId) {
    const attempts = [];
    if (this._models.repository && !/^(memory:|data:|https?:|file:|package:)/.test(String(assetId).trim())) {
      return {bytes: await this._models.resolveAssetBytes(assetId), attempts};
    }
    const trimmed = String(assetId).trim();
    if (isPackageAssetUri(trimmed)) {
      const ref = parsePackageAssetUri(trimmed);
      if (!ref) throw new Error(`Invalid package asset URI: ${trimmed}`);
      const packageAssets = globalThis.__host.packageAssets;
      const packageKey = `${ref.packageName}/${ref.path}`;
      const bytes = packageAssets.bound?.() ? await packageAssets.readAsync(packageKey) : packageAssets.read(packageKey);
      if (!bytes) throw new Error(`Package asset not found: ${trimmed}`);
      attempts.push(`package asset: ${trimmed}`);
      return { bytes, attempts };
    }
    const adapters = this._assetAdapters();
    const tryUri = async (adapter, uri) => {
      try {
        const bytes = await adapter.retrieve(uri);
        if (bytes) return bytes;
        attempts.push(`storage miss: ${uri}`);
      } catch (error) {
        attempts.push(`storage error: ${uri} (${error instanceof Error ? error.message : String(error)})`);
      }
      return null;
    };
    if (trimmed.includes("://") && !trimmed.startsWith("asset://")) {
      for (const adapter of adapters) {
        const bytes = await tryUri(adapter, trimmed);
        if (bytes) return { bytes, attempts };
      }
    }
    const ids = this._parseAssetIdCandidates(trimmed);
    for (const adapter of adapters) {
      for (const candidate of ids) {
        for (const key of this._assetKeysFor(candidate)) {
          let uri;
          try {
            uri = adapter.uriForKey(key);
          } catch {
            continue;
          }
          const bytes = await tryUri(adapter, uri);
          if (bytes) return { bytes, attempts };
        }
      }
      const bareId = ids[ids.length - 1];
      if (!bareId) continue;
      const owner = this.userId;
      // An id without its extension names <dir>/<id>.<ext>. The host reads the
      // owner's folder (or the id's own folder) for it, instead of the listing
      // below walking and sorting the whole store.
      if (typeof adapter.findStem === "function") {
        const slash = bareId.lastIndexOf("/");
        const stem = bareId.slice(slash + 1);
        const dirs = slash >= 0 ? [bareId.slice(0, slash)] : owner ? [owner, ""] : [""];
        for (const dir of dirs) {
          for (const key of adapter.findStem(dir, stem)) {
            if (/_(thumb|proxy)\./.test(key.slice(key.lastIndexOf("/") + 1))) continue;
            const bytes = await tryUri(adapter, adapter.uriForKey(key));
            if (bytes) return { bytes, attempts };
          }
        }
      }
      const prefixes = owner && !bareId.startsWith(`${owner}/`) ? [`${owner}/${bareId}`, bareId, owner, ""] : [bareId, ""];
      for (const prefix of prefixes) {
        try {
          const { entries } = await adapter.list(prefix);
          const needle = `${bareId}.`;
          const match = entries.find((e) => {
            const name = e.key.slice(e.key.lastIndexOf("/") + 1);
            return (e.key.startsWith(needle) || name.startsWith(needle)) && !/_(thumb|proxy)\./.test(name);
          });
          if (match) {
            const bytes = await tryUri(adapter, match.uri);
            if (bytes) return { bytes, attempts };
          }
        } catch (error) {
          attempts.push(`storage list error (${error instanceof Error ? error.message : String(error)})`);
        }
      }
    }
    return { bytes: null, attempts };
  }

  async assetToSandbox(assetId,path) {
    if(!this.workspace)throw new Error('Workspace is unavailable for this run');
    const {bytes}=await this.resolveAssetBytes(assetId);
    if(!bytes)throw new Error(`Unable to resolve asset '${assetId}' to sandbox bytes`);
    await this.workspace.write(path,bytes);
    return this.resolveWorkspacePath(path);
  }

  async sandboxToAsset(path) {
    if(!this.workspace)throw new Error('Workspace is unavailable for this run');
    const content=await this.workspace.read(path);
    if(content===null)throw new Error(`File '${path}' does not exist`);
    const name=this.workspace.key(path).split('/').pop();
    const extension=name.split('.').pop().toLowerCase();
    const mime={txt:'text/plain',md:'text/markdown',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',wav:'audio/wav',mp3:'audio/mpeg',mp4:'video/mp4',glb:'model/gltf-binary'}[extension]??'application/octet-stream';
    const asset=await this.createAsset({name,contentType:mime,content});
    return {type:mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document',uri:`asset://${asset.id}`,asset_id:asset.id};
  }

  // ---------------------------------------------------------------- http

  async httpGet(url) {
    const http = globalThis.__host.http;
    const r = http.bound?.() ? await http.getAsync(url) : http.get(url);
    const body = r.body;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      url: r.url,
      headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? r.contentType : null) },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      text: async () => new TextDecoder().decode(body),
      json: async () => JSON.parse(new TextDecoder().decode(body))
    };
  }

  async downloadFile(url) {
    const response = await this.httpGet(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  // -------------------------------------------------------------- output

  resolveWorkspacePath(path) {
    if (this.workspaceDir == null) {
      throw new Error(
        "No workspace is assigned. File operations require a user-defined workspace. Please configure a workspace before performing disk I/O operations."
      );
    }
    return `${this.workspaceDir}/${this.workspace.key(path)}`;
  }

  static _isAssetLike(value) {
    return isRecord(value) && "type" in value && ("uri" in value || "data" in value || "asset_id" in value);
  }

  static _decodeAssetData(data) {
    if (data === null || data === undefined) return null;
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data) && data.every((v) => Number.isInteger(v))) return new Uint8Array(data);
    if (typeof data === "string") return fromBase64(data);
    return null;
  }

  static _guessMime(asset, bytes) {
    const declared = asset.mimeType ?? asset.mime_type ?? asset.content_type;
    if (isNonEmptyString(declared) && declared !== "image/unknown") return declared;
    const type = String(asset.type ?? "").toLowerCase();
    if (type.includes("image")) return (bytes && sniffImageMime(bytes)) ?? "image/png";
    if (type.includes("audio")) return "audio/wav";
    if (type.includes("video")) return "video/mp4";
    if (type.includes("text")) return "text/plain";
    if (type.includes("model3d")) return "model/gltf-binary";
    return "application/octet-stream";
  }

  async _assetBytes(asset) {
    const decoded = GuestContext._decodeAssetData(asset.data);
    if (decoded) return decoded;
    const uri = asset.uri;
    if (typeof uri === "string" && this.storage) {
      const stored = await this.storage.retrieve(uri);
      if (stored) return stored;
    }
    if (typeof uri === "string" && (uri.startsWith("asset://") || /^\/?api\/storage\//.test(uri))) {
      const { bytes } = await this.resolveAssetBytes(uri);
      if (bytes) return bytes;
    }
    if (isNonEmptyString(asset.asset_id)) {
      const { bytes } = await this.resolveAssetBytes(`asset://${asset.asset_id}`);
      if (bytes) return bytes;
    }
    return null;
  }

  async _materializeAsset(raw, mode) {
    if (mode === "native" || mode === "raw") return raw;
    // Loaded on first use: the codec module pulls in the tracing helpers.
    const { encodeRawImageRef } = await import("guest-real:@nodetool-ai/runtime/image-codec.js");
    const asset = await encodeRawImageRef(raw);
    const bytes = await this._assetBytes(asset);
    if (!bytes) return asset;
    const mime = GuestContext._guessMime(asset, bytes);
    const ext = extForImageMime(mime) ?? ASSET_EXT[mime] ?? "bin";
    if (mode === "data_uri") return { ...asset, uri: `data:${mime};base64,${base64(bytes)}` };
    if (mode === "storage_url" || mode === "temp_url") {
      const prefix = mode === "storage_url" ? "assets" : "temp";
      return { ...asset, uri: await this.storage.store(`${prefix}/${randomUUID()}.${ext}`, bytes, mime), data: undefined };
    }
    if (mode === "workspace") {
      if (!this.workspace) throw new Error("workspace_dir is required for workspace asset output");
      const key = `assets/${randomUUID()}.${ext}`;
      await this.workspace.write(key, bytes);
      return { ...asset, uri: this.workspace.uri(key), data: undefined };
    }
    return asset;
  }

  /** As ProcessingContext.normalizeOutputValue: bytes become {type: "bytes", length}. */
  async normalizeOutputValue(value, mode = this.assetOutputMode) {
    if (value === null || value === undefined) return value;
    if (value instanceof Uint8Array) return { type: "bytes", length: value.length };
    if (value instanceof ArrayBuffer) return { type: "bytes", length: value.byteLength };
    if (Array.isArray(value)) return Promise.all(value.map((item) => this.normalizeOutputValue(item, mode)));
    if (GuestContext._isAssetLike(value)) {
      let byMode = this._normalizedOutputAssets.get(value);
      if (!byMode) {
        byMode = new Map();
        this._normalizedOutputAssets.set(value, byMode);
      }
      let normalized = byMode.get(mode);
      if (!normalized) {
        normalized = this._materializeAsset(value, mode);
        byMode.set(mode, normalized);
      }
      try {
        return await normalized;
      } catch (error) {
        if (byMode.get(mode) === normalized) byMode.delete(mode);
        throw error;
      }
    }
    if (isRecord(value)) {
      const entries = await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await this.normalizeOutputValue(v, mode)])
      );
      return Object.fromEntries(entries);
    }
    return value;
  }

  async assetsToDataUri(value) {
    return this.normalizeOutputValue(value, "data_uri");
  }

  async assetsToStorageUrl(value) {
    return this.normalizeOutputValue(value, "storage_url");
  }

  async assetsToWorkspaceFiles(value) {
    return this.normalizeOutputValue(value, "workspace");
  }

  async uploadAssetsToTemp(value) {
    return this.normalizeOutputValue(value, "temp_url");
  }
}

/** A fresh context for one run. */
export function createContext(jobId, workflowId) {
  return new GuestContext({ jobId, workflowId });
}

export { NEVER_ABORTED };
