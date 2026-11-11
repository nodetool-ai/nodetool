// The guest module contract: every specifier node code may import from the
// packages the native host provides, with each export it imports and where
// that export comes from. guest/build.mjs resolves these specifiers through
// this table, and the build fails when bundled code imports a name the table
// does not classify, or when the table classifies a name its provider does
// not have (module-contract-build.mjs). See guest/host/README.md.
//
// Each export has one kind:
//   guest(from)          the real package code, bundled through `guest-real:`
//                        or the normal resolution. `from` names the module.
//   impl(file, as?)      a hand-written guest module, relative to guest/.
//                        `as` is its export name when it differs.
//   host(...ops)         forwards to C++ host operations, `__host.<ns>.<op>`,
//                        through guest/host/media-native.mjs.
//   unavailable(reason, note)
//                        not provided. The bundle carries a stub that throws
//                        "guest: <spec>.<name> is unavailable in the native
//                        runner (<reason>: <note>)" when called or read.
//
// A module record has:
//   provider   the guest file (relative to guest/) the specifier resolves
//              to, or `{ package }` for an npm package bundled instead.
//   wrap       true when the specifier resolves straight to the provider, so
//              the module has exactly the provider's exports. Otherwise the
//              module is a generated stub with every export of the real
//              package: listed exports come from the provider or throw,
//              other exports come from the provider when it has them.
//   exports    the classified names. "default" is the default export.
//   rest       the classification of exports not listed, required when
//              bundled code uses the module as a whole (a namespace passed
//              around, or a `require()` whose result is not destructured).
//   whole      an unavailable() for every export, for packages the guest
//              cannot load at all. `subpaths` extends it to `<pkg>/<path>`.
//
// Node builtins are keyed `node:<name>` and match with or without the prefix.

export const REASONS = {
  "server-only": "needs a NodeTool server service, process or account",
  python: "needs the Python bridge",
  "host-binary": "starts a host program",
  "native-addon": "loads a native addon or WebAssembly module QuickJS cannot run",
  kernel: "part of the TypeScript workflow kernel, which the C++ kernel in src/kernel/ replaces",
  "not-yet-ported": "has no guest implementation yet"
};

const guest = (from) => ({ kind: "guest", from });
const impl = (file, as) => ({ kind: "guest-impl", file, ...(as ? { as } : {}) });
const host = (...ops) => ({ kind: "host", file: "host/media-native.mjs", ops });
const unavailable = (reason, note) => ({ kind: "unavailable", reason, note });

const RT = "@nodetool-ai/runtime";
const realRuntime = (path) => guest(`${RT}/${path}`);
const nodeMedia = (note = "the runtime implements it with node-av, and host media has no equivalent yet") =>
  unavailable("not-yet-ported", note);
const hostBinaries = unavailable("host-binary", "part of the runtime's host program launcher");
const python = unavailable("python", "talks to the Python worker");
const comfy = unavailable("server-only", "talks to a ComfyUI server");
const wan2gp = unavailable("server-only", "talks to a local Wan2GP server");
const google = unavailable("server-only", "uses the server's Google account tokens");
const ytDlp = unavailable("host-binary", "configures the yt-dlp program");
const blender = unavailable("host-binary", "runs Blender");
const providerRegistry = unavailable("server-only", "reads the server's provider registry instead of the context's providers");
const generations = unavailable("server-only", "part of the server's durable generation registry");
const pure = (note) => unavailable("not-yet-ported", note);
const tsKernel = unavailable("kernel", "part of the TypeScript workflow kernel, which the C++ kernel in src/kernel/ replaces");

export const MODULES = {
  [RT]: {
    provider: "host/runtime.mjs",
    exports: {
      ACTIVE_MODEL_CONTEXT_KEY: pure("a constant of the runtime's processing context"),
      BaseProvider: realRuntime("providers/base-provider.js"),
      BlenderExecutorError: blender,
      DEFAULT_YT_DLP_FORMAT: ytDlp,
      DIRECT_TOOL_NAMES: pure("a constant of the runtime's core tools"),
      GenerationAlreadyAcceptedError: generations,
      HostBinaryMissingError: hostBinaries,
      MAX_ARTIFACT_BYTES: hostBinaries,
      MAX_CAPTURED_BYTES: hostBinaries,
      PERMISSION_GATE_CONTEXT_KEY: realRuntime("permission-gate.js"),
      ProcessingContext: impl("host/context.mjs", "GuestContext"),
      RECOMMENDED_MODELS: pure("the runtime's recommended model list"),
      RecoverableNodeError: realRuntime("recoverable-node-error.js"),
      SVG_MIME: realRuntime("providers/image-mime.js"),
      WAN2GP_DEFAULT_MAX_MEDIA_BYTES: wan2gp,
      WAN2GP_MAX_MEDIA_BYTES: wan2gp,
      WEB_SEARCH_TOOL_NAME: realRuntime("providers/types.js"),
      WebsocketPythonBridge: python,
      assetRefToPromptToken: realRuntime("prompt-asset-refs"),
      budgetFromContext: realRuntime("turn-budget.js"),
      calendarCreateEvent: google,
      calendarDeleteEvent: google,
      calendarListCalendars: google,
      calendarListEvents: google,
      clampTimeoutSeconds: hostBinaries,
      configureRunTraceStore: unavailable("server-only", "configures the server's run trace store"),
      connectPythonBridgeForGraph: python,
      countTokens: unavailable("native-addon", "loads the tiktoken tokenizer through importOptionalModule"),
      createLocalWorkspace: unavailable("server-only", "creates a server workspace instead of using context.workspace"),
      createPythonBridge: python,
      createRunBudget: realRuntime("turn-budget.js"),
      createSemaphore: pure("a pure helper of the runtime's turn budget"),
      createWorkspace: unavailable("server-only", "creates a server workspace instead of using context.workspace"),
      currentGenerationReceipt: generations,
      decidePermission: realRuntime("permission-gate.js"),
      detectImageMime: realRuntime("providers/image-mime.js"),
      docsAppendText: google,
      docsCreateDocument: google,
      docsGetDocument: google,
      driveCreateFile: google,
      driveGetFile: google,
      driveReadFile: google,
      driveSearchFiles: google,
      executeBlender: blender,
      executeComfy: comfy,
      expandAssetReferences: realRuntime("prompt-asset-refs"),
      extForImageMime: realRuntime("providers/image-mime.js"),
      extractImageRegion: unavailable("native-addon", "crops with sharp in the runtime's image codec"),
      extractJson: realRuntime("providers/structured-output.js"),
      fetchExternalMedia: impl("host/media-fetch.mjs"),
      generateStructured: realRuntime("providers/structured-output.js"),
      generationDeliveryOf: generations,
      generationRegistry: generations,
      getCostReconciler: realRuntime("cost-reconciler.js"),
      getProcessSandboxModuleCatalog: unavailable("server-only", "reads the server's sandbox pack catalog"),
      getProvider: providerRegistry,
      getProviderSecretKey: providerRegistry,
      getProviderStreamTrace: realRuntime("providers/loop-tracing.js"),
      getRunTraceScope: realRuntime("run-trace-context.js"),
      getTracer: realRuntime("telemetry.js"),
      gmailGetMessage: google,
      gmailListLabels: google,
      gmailModifyLabels: google,
      gmailSearchMessages: google,
      gmailSendMessage: google,
      headlessDenialReason: pure("a pure helper of the runtime's permission gate"),
      headlessGate: realRuntime("permission-gate.js"),
      imageModelSupportsTask: pure("a pure helper of the runtime's image model table"),
      inAppRunCostAccount: unavailable("server-only", "part of the server's app run billing"),
      initTelemetry: unavailable("server-only", "starts the server's OpenTelemetry exporter"),
      initializeTokenCounter: unavailable("native-addon", "loads the tiktoken tokenizer through importOptionalModule"),
      isChunk: guest("@nodetool-ai/protocol"),
      isProviderConfigured: providerRegistry,
      isProviderGenerationsUnsupported: pure("a pure helper of the runtime's provider generations"),
      isProviderMessageEvent: pure("a pure helper of the runtime's provider types"),
      isProviderStop: realRuntime("providers/types.js"),
      isRecoverableNodeError: realRuntime("recoverable-node-error.js"),
      isRunBudget: pure("a pure helper of the runtime's turn budget"),
      isSafePublicHttpsUrl: realRuntime("providers/safe-url.js"),
      isSvgBytes: realRuntime("providers/image-mime.js"),
      isToolCall: realRuntime("providers/types.js"),
      listOfflineModelIds: unavailable("server-only", "reads the server's offline model manifests"),
      listOfflineRequiredTextInputs: unavailable("server-only", "reads the server's offline model manifests"),
      listRegisteredProviderIds: providerRegistry,
      loadCanvas: impl("host/canvas.mjs"),
      loadMediaModule: unavailable("native-addon", "loads the runtime's node-av media module"),
      loadMediaRefBytes: impl("host/runtime.mjs"),
      mapPromptAssetsToInputs: realRuntime("prompt-asset-refs"),
      markWan2GPModelAvailable: wan2gp,
      maxConcurrentHostBinaries: hostBinaries,
      mediaResolverFor: pure("a helper of the runtime's processing context"),
      memoryKeys: unavailable("server-only", "part of the server's agent memory store"),
      messageText: realRuntime("providers/structured-output.js"),
      mimeFromFilename: hostBinaries,
      mp4DurationSeconds: unavailable("server-only", "part of the ComfyUI Cloud provider module"),
      objectTrackingRequestSchema: pure("a schema of the runtime's object tracking provider"),
      observeWorkspace: unavailable("server-only", "watches a server workspace"),
      parseObjectTrackingResult: pure("a parser of the runtime's object tracking provider"),
      parseWithTypeCoercion: guest("@nodetool-ai/protocol/zod-schema"),
      probeVideoDurationSeconds: unavailable("native-addon", "probes with node-av and sharp in the runtime's video frames module"),
      rasterizeSvgInput: impl("host/runtime.mjs"),
      rasterizeSvg: unavailable("native-addon", "rasterizes with sharp in the runtime's image codec"),
      recordTraceEvent: realRuntime("run-trace-context.js"),
      registerCostReconciler: realRuntime("cost-reconciler.js"),
      requireGoogleAccessToken: google,
      resolveEntities: realRuntime("entities"),
      resolvePythonNodeExecutor: python,
      runHostBinary: hostBinaries,
      safeFetch: impl("host/media-fetch.mjs"),
      selectedYtDlpFormats: ytDlp,
      sheetsAppendRows: google,
      sheetsCreateSpreadsheet: google,
      sheetsReadRange: google,
      sheetsUpdateRange: google,
      sniffAudioMime: realRuntime("providers/audio-mime.js"),
      sniffAudioMimeOrNull: realRuntime("providers/audio-mime.js"),
      sniffImageMime: realRuntime("providers/image-mime.js"),
      sniffMedia: pure("a pure helper of the runtime's media type sniffing"),
      splitYtDlpFormat: ytDlp,
      stringifyTraceContent: realRuntime("run-trace-serialization.js"),
      suppressRunTraceContent: realRuntime("run-trace-context.js"),
      uploadComfyFile: comfy,
      wan2gpAudioFilename: wan2gp,
      wan2gpImageFilename: wan2gp,
      wan2gpVideoFilename: wan2gp,
      withAgentSpanGen: pure("a helper of the runtime's tracing"),
      withRunTrace: realRuntime("run-trace-context.js"),
      withSpan: pure("a helper of the runtime's tracing"),
      withTimelineRenderSlot: impl("host/runtime.mjs"),
      withWan2GPClient: wan2gp,
      zodToJsonSchema: guest("@nodetool-ai/protocol/zod-schema")
    }
  },
  [`${RT}/entities`]: {
    provider: "host/runtime.mjs",
    exports: { resolveEntities: realRuntime("entities") }
  },
  [`${RT}/media`]: {
    provider: "host/runtime.mjs",
    exports: {
      concatCopy: host("media.abort", "media.close", "media.finish", "media.muxAudio", "media.next", "media.openEncoder",
        "media.openFilter", "media.probe", "media.write"),
      concatSegments: host("media.abort", "media.close", "media.finish", "media.muxAudio", "media.next", "media.openEncoder",
        "media.openFilter", "media.probe", "media.write"),
      convertAudioToWav: host("media.close", "media.next", "media.openFilter", "media.probe"),
      decodeAudioToPcm: host("media.close", "media.next", "media.openFilter"),
      ensureMediabunnyServer: unavailable("server-only", "starts the server's mediabunny helper"),
      hasEncoder: host("media.hasEncoder"),
      muxAudioWithVideoCopy: host("media.muxAudio"),
      muxStreamCopy: nodeMedia(),
      openFilterComplex: host("media.close", "media.next", "media.openFilter"),
      openFilterGraph: host("media.close", "media.next", "media.openFilter"),
      openRgbaFrameReader: host("media.close", "media.next", "media.openFilter"),
      openVideoFrameEncoder: host("media.abort", "media.finish", "media.openEncoder", "media.write"),
      packetTimes: host("media.packetTimes"),
      pngFrames: host("media.close", "media.next", "media.openFilter"),
      probeDurationSec: host("media.probe"),
      probeHasAudio: host("media.probe"),
      probeMedia: host("media.probe"),
      probeVideoStream: host("media.probe"),
      transcodeVideo: nodeMedia(),
      transformMedia: host("media.abort", "media.close", "media.finish", "media.muxAudio", "media.next", "media.openEncoder",
        "media.openFilter", "media.probe", "media.write")
    }
  },
  [`${RT}/media-ref-bytes`]: {
    provider: "host/runtime.mjs",
    exports: { loadMediaRefBytes: impl("host/runtime.mjs") }
  },
  [`${RT}/prompt-asset-refs`]: {
    provider: "host/runtime.mjs",
    exports: { mapPromptAssetsToInputs: realRuntime("prompt-asset-refs") }
  },
  [`${RT}/provider-transport`]: {
    provider: "host/runtime.mjs",
    exports: {
      imageRefFromBytes: pure("a pure helper of the runtime's provider transport"),
      sleep: pure("a timer helper of the runtime's provider transport")
    }
  },
  [`${RT}/safe-url`]: {
    provider: "host/runtime.mjs",
    exports: { isBlockedIpLiteral: realRuntime("providers/safe-url.js") }
  },
  [`${RT}/trim-video-window`]: {
    provider: "host/runtime.mjs",
    exports: { trimVideoWindow: pure("a pure helper of the runtime's video trimming") }
  },

  "@nodetool-ai/storage": {
    provider: "host/storage.mjs",
    exports: {
      FileStorageAdapter: unavailable("server-only", "stores in a server directory instead of the assets capability"),
      assetKeyCandidates: pure("a pure helper of the storage package"),
      assetObjectKey: pure("a pure helper of the storage package"),
      getMaxLocalUploadBytes: unavailable("server-only", "reads the server's upload limit")
    }
  },

  "@nodetool-ai/config": {
    provider: "shims/config.cjs",
    exports: {
      IS_NODE: impl("shims/config.cjs"),
      SHIPPED_SANDBOX_PACKS_BUNDLE_DIR: unavailable("server-only", "an install directory of the server"),
      SHIPPED_SANDBOX_PACKS_SOURCE_DIR: unavailable("server-only", "an install directory of the server"),
      SHIPPED_SYSTEM_SKILLS_BUNDLE_DIR: unavailable("server-only", "an install directory of the server"),
      SHIPPED_SYSTEM_SKILLS_SOURCE_DIR: unavailable("server-only", "an install directory of the server"),
      createLogger: impl("shims/config.cjs"),
      createTraceTextRedactor: pure("a helper of the config package's trace redaction"),
      esmExportPath: unavailable("server-only", "resolves package files on the server's disk"),
      getDefaultAssetsPath: unavailable("server-only", "a data directory of the server"),
      getDefaultVectorstoreDbPath: impl("shims/config.cjs"),
      getEnv: impl("shims/config.cjs"),
      getManagedWorkspaceDir: unavailable("server-only", "a data directory of the server"),
      getNodeBuiltinSync: impl("shims/config.cjs"),
      getNodetoolCacheDir: unavailable("server-only", "a data directory of the server"),
      getNodetoolDataDir: unavailable("server-only", "a data directory of the server"),
      importHidden: impl("shims/config.cjs"),
      importNodeBuiltin: impl("shims/config.cjs"),
      importOptionalModule: impl("shims/config.cjs"),
      isAuthEnforced: unavailable("server-only", "reads the server's auth settings"),
      isAutomaticStorageCleanupEnabled: impl("shims/config.cjs"),
      isCreditModelAllowed: unavailable("server-only", "reads the server's credit settings"),
      loadPackageAssetBytes: unavailable("server-only", "reads package files from the server's disk instead of the packageAssets capability"),
      loadPackageAssetJson: impl("shims/config.cjs"),
      managedWorkspaceKey: unavailable("server-only", "names a server workspace"),
      packageManifestSchema: pure("a schema of the config package"),
      redactPrivateKeys: pure("a helper of the config package's trace redaction"),
      redactTraceText: pure("a helper of the config package's trace redaction"),
      resolvePackageAssetPath: unavailable("server-only", "resolves package files on the server's disk instead of the packageAssets capability"),
      safeProcessEnv: impl("shims/config.cjs"),
      setLogHook: pure("a hook of the config package's logger"),
      settingCatalog: pure("the config package's settings catalog"),
      settingDefinition: pure("a lookup in the config package's settings catalog"),
      signupGrantCredits: unavailable("server-only", "reads the server's credit settings"),
      workspaceStorageKind: unavailable("server-only", "reads the server's workspace settings")
    }
  },

  "@nodetool-ai/kernel": {
    provider: "shims/kernel.cjs",
    exports: {
      BoundedHandle: tsKernel,
      DEFAULT_MAX_ITERATIONS: impl("shims/kernel.cjs"),
      DEFAULT_MESSAGE_BUFFER_LIMIT: tsKernel,
      Graph: tsKernel,
      MAX_ITERATIONS_LIMIT: impl("shims/kernel.cjs"),
      MessageStream: tsKernel,
      WorkflowRunner: tsKernel,
      mergeDerivedSlots: tsKernel,
      rewriteBypassedNodes: tsKernel,
      validateSubstituteOutputs: tsKernel,
      withExplicitNodeFlags: tsKernel
    }
  },

  // Node builtins with a guest implementation.
  "node:fs": {
    provider: "host/fs.mjs",
    exports: {
      accessSync: impl("host/fs.mjs"),
      chmodSync: pure("file modes are not part of the files capability"),
      constants: impl("host/fs.mjs"),
      copyFileSync: impl("host/fs.mjs"),
      createReadStream: pure("file streams are not part of the files capability"),
      createWriteStream: pure("file streams are not part of the files capability"),
      default: impl("host/fs.mjs"),
      existsSync: impl("host/fs.mjs"),
      lstatSync: impl("host/fs.mjs"),
      mkdirSync: impl("host/fs.mjs"),
      openAsBlob: pure("file streams are not part of the files capability"),
      promises: impl("host/fs.mjs"),
      readFile: impl("host/fs.mjs"),
      readFileSync: impl("host/fs.mjs"),
      readdirSync: impl("host/fs.mjs"),
      realpathSync: impl("host/fs.mjs"),
      rmSync: impl("host/fs.mjs"),
      statSync: impl("host/fs.mjs"),
      unlink: impl("host/fs.mjs"),
      unlinkSync: impl("host/fs.mjs"),
      watch: unavailable("server-only", "watches the host file system"),
      writeFile: impl("host/fs.mjs"),
      writeFileSync: impl("host/fs.mjs")
    },
    rest: pure("not part of the files capability")
  },
  "node:fs/promises": {
    provider: "host/fs-promises.mjs",
    exports: Object.fromEntries(
      ["default", "lstat", "mkdir", "mkdtemp", "open", "readFile", "readdir", "realpath", "rename", "rm", "stat", "unlink", "writeFile"]
        .map((name) => [name, impl("host/fs-promises.mjs")])
    )
  },
  "node:path": {
    provider: "host/path.mjs",
    exports: Object.fromEntries(
      ["basename", "default", "dirname", "extname", "isAbsolute", "join", "normalize", "posix", "relative", "resolve", "sep"]
        .map((name) => [name, impl("host/path.mjs")])
    ),
    rest: pure("not implemented by guest/host/path.mjs")
  },
  "node:os": {
    provider: "host/os.mjs",
    exports: {
      arch: pure("not implemented by guest/host/os.mjs"),
      default: impl("host/os.mjs"),
      endianness: impl("host/os.mjs"),
      homedir: impl("host/os.mjs"),
      hostname: impl("host/os.mjs"),
      release: pure("not implemented by guest/host/os.mjs"),
      tmpdir: impl("host/os.mjs")
    },
    rest: pure("not implemented by guest/host/os.mjs")
  },
  "node:url": {
    provider: "host/url.mjs",
    exports: {
      URL: impl("host/url.mjs"),
      fileURLToPath: impl("host/url.mjs"),
      pathToFileURL: impl("host/url.mjs")
    },
    rest: pure("not implemented by guest/host/url.mjs")
  },
  "node:process": {
    provider: "host/process.mjs",
    exports: { default: impl("host/process.mjs") },
    rest: pure("not implemented by guest/host/process.mjs")
  },
  "node:timers": { provider: "host/timers.mjs", exports: {} },
  "node:crypto": {
    provider: "shims/crypto.cjs",
    wrap: true,
    exports: {
      createCipheriv: pure("ciphers are not part of guest/host/crypto.mjs"),
      createDecipheriv: pure("ciphers are not part of guest/host/crypto.mjs"),
      createHash: impl("host/crypto.mjs"),
      createHmac: impl("host/crypto.mjs"),
      default: impl("host/crypto.mjs"),
      pbkdf2Sync: pure("key derivation is not part of guest/host/crypto.mjs"),
      randomBytes: impl("host/crypto.mjs"),
      randomInt: pure("not part of guest/host/crypto.mjs"),
      randomUUID: impl("host/crypto.mjs"),
      timingSafeEqual: pure("not part of guest/host/crypto.mjs")
    }
  },
  "node:buffer": {
    provider: { package: "buffer/" },
    wrap: true,
    exports: { Buffer: guest("buffer") }
  },

  // Node builtins without a guest implementation.
  "node:child_process": { whole: unavailable("host-binary", "starts host processes") },
  "node:cluster": { whole: unavailable("server-only", "forks server processes") },
  "node:diagnostics_channel": { whole: pure("Node's diagnostics channels") },
  "node:events": { whole: pure("Node's EventEmitter") },
  "node:http": { whole: unavailable("server-only", "opens network servers and sockets") },
  "node:https": { whole: unavailable("server-only", "opens network servers and sockets") },
  "node:module": { whole: unavailable("server-only", "Node's module loader") },
  "node:net": { whole: unavailable("server-only", "opens network servers and sockets") },
  "node:perf_hooks": { whole: pure("Node's perf_hooks module, not the global performance the guest has") },
  "node:stream": { whole: pure("Node streams") },
  "node:stream/promises": { whole: pure("Node streams") },
  "node:stream/web": { whole: pure("web streams") },
  "node:string_decoder": { whole: pure("Node's StringDecoder") },
  "node:timers/promises": { whole: pure("promise timers, not the timer globals the guest has") },
  "node:tls": { whole: unavailable("server-only", "opens network servers and sockets") },
  "node:tty": { whole: pure("terminal queries") },
  "node:util": { whole: pure("Node's util module") },
  "node:v8": { whole: pure("V8 serialization") },
  "node:worker_threads": { whole: unavailable("server-only", "starts worker threads") },
  "node:zlib": { whole: pure("zlib compression") },

  // Packages a host capability provides.
  "@nodetool-ai/agents": {
    provider: "host/agents.mjs",
    wrap: true,
    exports: {
      TOOL_CALL_ID_FIELD: guest("packages/agents/src/tools/subtask-fields.ts"),
      Tool: guest("packages/agents/src/tools/base-tool.ts"),
      agentActivityReporter: guest("packages/agents/src/capabilities/agent-activity.ts"),
      gateFromContext: guest("packages/agents/src/capabilities/gate-from-context.ts"),
      gateLegacyTools: guest("packages/agents/src/capabilities/legacy-tools.ts"),
      getBuiltinTools: impl("host/agents.mjs"),
      getMediaTools: impl("host/agents.mjs")
    }
  },
  "@nodetool-ai/agents/js-sandbox": {
    provider: "host/sandbox.mjs",
    wrap: true,
    exports: {
      NODETOOL_API_PRELUDE_FULL: guest("packages/agents/src/codeact/nodetool-api.ts"),
      TOOLS_PRELUDE: guest("packages/agents/src/codeact/tools-prelude.ts"),
      runInSandbox: impl("host/sandbox.mjs")
    }
  },
  "@nodetool-ai/gpu/node": {
    provider: "host/gpu-node.mjs",
    wrap: true,
    exports: {
      compositeImageLayers: impl("host/gpu-node.mjs"),
      createNodeGPUContext: impl("host/gpu-node.mjs"),
      getNodeGPUDevice: impl("host/gpu-node.mjs")
    }
  },
  "better-sqlite3": { provider: "host/sqlite.mjs", wrap: true, exports: { default: impl("host/sqlite.mjs") } },
  "sqlite-vec": { provider: "host/sqlite-vec.mjs", wrap: true, exports: { load: impl("host/sqlite-vec.mjs") } },
  "file-type": {
    provider: "shims/file-type.mjs",
    wrap: true,
    exports: {
      fileTypeFromBuffer: guest("file-type/core"),
      fileTypeFromFile: impl("shims/file-type.mjs")
    }
  },
  "@napi-rs/canvas": {
    provider: "host/canvas.mjs",
    wrap: true,
    exports: { createCanvas: impl("host/canvas.mjs"), loadImage: impl("host/canvas.mjs") }
  },

  // Packages QuickJS cannot load: native addons, WebAssembly and launchers
  // for host processes.
  sharp: { whole: unavailable("native-addon", "the libvips addon, which the image nodes replace with the native image adapter"), subpaths: true },
  webgpu: { whole: unavailable("native-addon", "Dawn, which the gpu capability replaces"), subpaths: true },
  playwright: { whole: unavailable("host-binary", "launches a browser"), subpaths: true },
  "playwright-core": { whole: unavailable("host-binary", "launches a browser"), subpaths: true },
  "@hyzyla/pdfium": { whole: unavailable("native-addon", "the PDFium WebAssembly build"), subpaths: true },
  "onnxruntime-node": { whole: unavailable("native-addon", "the ONNX Runtime addon"), subpaths: true },
  "onnxruntime-web": { whole: unavailable("native-addon", "the ONNX Runtime WebAssembly build"), subpaths: true },
  "@huggingface/transformers": { whole: unavailable("native-addon", "runs models on ONNX Runtime"), subpaths: true },
  "node-llama-cpp": { whole: unavailable("native-addon", "the llama.cpp addon"), subpaths: true },
  canvas: { whole: unavailable("native-addon", "the Cairo addon, not the @napi-rs/canvas the guest provides"), subpaths: true },
  fsevents: { whole: unavailable("native-addon", "the macOS file events addon"), subpaths: true }
};

/**
 * Node types whose reach of an unavailable export is known not to happen in
 * the native runner, with the exports and the reason. The admission check
 * ignores exactly these; the build fails when one is no longer reached.
 */
export const NODE_EXCEPTIONS = {
  "nodetool.workflows.subgraph.Subgraph": {
    exports: ["@nodetool-ai/kernel.Graph", "@nodetool-ai/kernel.WorkflowRunner", "@nodetool-ai/kernel.withExplicitNodeFlags"],
    note: "the C++ kernel runs Subgraph nodes itself (src/kernel/runner.cpp), not the TypeScript body"
  },
  "nodetool.timeline.RenderTimeline": {
    exports: [
      "@nodetool-ai/config.getNodetoolCacheDir",
      "@nodetool-ai/config.resolvePackageAssetPath",
      "@nodetool-ai/runtime/media.transcodeVideo",
      "node:child_process.execFileSync",
      "node:child_process.spawn",
      "node:fs.chmodSync",
      "node:fs.createReadStream",
      "node:fs.createWriteStream",
      "node:http.createServer",
      "node:os.arch",
      "node:timers/promises.setImmediate",
      "node:tty.isatty",
      "node:worker_threads.*",
      "node:zlib.crc32"
    ],
    note: "reached on optional paths: the browser renderer and its Chrome launcher, PNG-sequence output and Google Fonts downloads. " +
      "The native runner renders through host media (NODETOOL_TIMELINE_RENDERER=node), which the media tests run"
  }
};
