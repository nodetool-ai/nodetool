/**
 * The `nodetool` object model — the agent-facing JS API for the CodeAct
 * sandbox. Where `tools.<name>()` is the raw RPC surface, `nodetool.*` is the
 * platform as objects: workflows, models, assets,
 * jobs, collections, timelines, sketches, scripts, and storyboards, plus a
 * bounded-concurrency `batch()` for fan-out (run a workflow once per CSV row,
 * validate every timeline, render all boards).
 *
 * Every method is a thin wrapper over an existing belt tool, so permission
 * gating, routing, and validation stay where they are. A method whose backing
 * tool is missing from the belt throws a message naming the tool instead of a
 * TypeError. The prelude assumes `CODEACT_PRELUDE` ran first (it uses
 * `tools.*`); `nodetool.workflows.open()` additionally uses `openWorkflow`
 * from the graph-model prelude when that is loaded.
 */

import { GRAPH_JSON_PRELUDE } from "../graph-dsl-core.js";
import { GRAPH_DSL_PROMPT_SECTION } from "./graph-dsl-package.js";

/** Namespace → the belt tools that light it up (any one is enough). */
export const NODETOOL_API_NAMESPACE_TOOLS: Record<string, readonly string[]> = {
  workflows: [
    "list_workflows",
    "get_workflow",
    "create_workflow",
    "run_workflow",
    "start_background_job",
    "debug_workflow",
    "validate_workflow",
    "resolve_workflow_escalation",
    "get_example_workflow"
  ],
  // Documented in the sandbox-packages section rather than in the namespace
  // list, but covered here so the two discovery tools are not also catalogued
  // as raw `tools.*` signatures.
  packs: ["list_sandbox_packages", "get_sandbox_package_docs"],
  nodes: ["search_nodes", "get_node_info", "list_nodes", "run_node"],
  agents: ["run_subtask"],
  models: ["find_model", "list_models", "list_provider_models"],
  media: [
    "generate_image",
    "edit_image",
    "generate_video",
    "animate_image",
    "generate_speech",
    "transcribe_audio",
    "embed_text",
    "critique_image",
    "compare_images",
    "score_image_adherence",
    "ffmpeg",
    "yt_dlp"
  ],
  documents: [
    "convert_document",
    "extract_pdf_text",
    "extract_pdf_tables",
    "convert_markdown_to_pdf",
    "convert_pdf_to_markdown"
  ],
  web: [
    "web_search",
    "google_news",
    "google_images",
    "http_request",
    "download_file",
    "browser",
    "take_screenshot"
  ],
  memory: [
    "thread_memory_save",
    "thread_memory_list",
    "thread_memory_update",
    "thread_memory_delete"
  ],
  shared: ["list_shared", "read_shared", "share_result"],
  threads: ["list_threads", "get_thread", "get_message"],
  email: ["search_email", "archive_email", "add_label_to_email"],
  style: ["get_style_profile", "record_style_preference"],
  assets: [
    "list_assets",
    "get_asset",
    "asset_search",
    "save_asset",
    "read_asset",
    "list_images"
  ],
  jobs: ["list_jobs", "get_job", "get_job_logs"],
  collections: [
    "list_collections",
    "query_collection",
    "vector_index",
    "vector_batch_index",
    "vector_text_search",
    "vector_hybrid_search"
  ],
  apps: ["debug_app"],
  timelines: [
    "list_timelines",
    "list_timeline_versions",
    "get_timeline_version",
    "create_timeline_version",
    "restore_timeline_version",
    "validate_timeline",
    "edit_timeline"
  ],
  sketches: [
    "list_sketches",
    "list_sketch_versions",
    "get_sketch_version",
    "create_sketch_version",
    "restore_sketch_version",
    "validate_sketch",
    "edit_sketch"
  ],
  scripts: [
    "list_scripts",
    "get_script",
    "voice_script_lines",
    "assemble_script_timeline",
    "edit_script"
  ],
  storyboards: [
    "list_storyboards",
    "get_storyboard",
    "render_storyboard_stills",
    "render_storyboard_clips",
    "revise_storyboard_clip",
    "assemble_storyboard_timeline",
    "edit_storyboard"
  ]
};

/** Whether a belt carries anything the `nodetool` object model can drive. */
export function hasNodetoolApiTools(toolNames: Iterable<string>): boolean {
  const names = new Set(toolNames);
  for (const group of Object.values(NODETOOL_API_NAMESPACE_TOOLS)) {
    if (group.some((name) => names.has(name))) return true;
  }
  return false;
}

/**
 * The belt tools the object model wraps — the ones the prompt should NOT
 * also document as raw `tools.*` calls. One surface per capability: wrapped
 * tools stay callable through the bridge, but the catalog documents only the
 * `nodetool.*` form.
 */
export function nodetoolApiCoveredToolNames(
  toolNames: Iterable<string>
): Set<string> {
  const names = new Set(toolNames);
  const covered = new Set<string>();
  for (const group of Object.values(NODETOOL_API_NAMESPACE_TOOLS)) {
    for (const name of group) {
      if (names.has(name)) covered.add(name);
    }
  }
  return covered;
}

/**
 * Guest-side prelude defining the global `nodetool`. Plain QuickJS-safe JS —
 * no host bridges of its own; every effect goes through `tools.*`.
 */
export const NODETOOL_API_PRELUDE = `
const nodetool = (() => {
  const __has = (name) => typeof tools[name] === "function";
  const __need = (name) => {
    const fn = tools[name];
    if (typeof fn !== "function") {
      throw new Error(
        'nodetool: tool "' + name + '" is not in this toolbelt, so this ' +
        "method is unavailable here. nodetool.searchTools() lists what is."
      );
    }
    return fn;
  };
  const __merge = (a, b) => Object.assign({}, a || {}, b || {});

  /**
   * Accept a GraphBuilder, a bare {nodes, edges}, or a workflow record —
   * the shared graph DSL core's normalizer.
   */
  const __graphJson = __graphJsonOf;

  /**
   * Build the args for a routed web-search tool. The tool routes across the
   * configured backends host-side; \`opts.provider\` maps onto its \`backend\`
   * pin (\`aliases\` translates the old guest names — "default", "google" —
   * onto the tool's backend enum; other values pass through).
   */
  const __webArgs = (opts, aliases, field, query) => {
    const args = __merge(opts);
    const provider = args.provider;
    delete args.provider;
    if (provider !== undefined) args.backend = aliases[provider] || provider;
    args[field] = String(query === undefined || query === null ? "" : query);
    return args;
  };

  /**
   * Normalize a model reference to the {provider, model} pair the media
   * tools take. Accepts a find/pick result ({provider, model_id}), a bare
   * {provider, model|id}, or a "provider/model_id" string (split on the
   * FIRST slash, so fal ids like "fal_ai/fal-ai/flux/schnell" work).
   */
  const __model = (m) => {
    if (m && typeof m === "object") {
      const id = m.model_id || m.model || m.id;
      if (m.provider && id) return { provider: m.provider, model: id };
    }
    if (typeof m === "string" && m.indexOf("/") > 0) {
      return {
        provider: m.slice(0, m.indexOf("/")),
        model: m.slice(m.indexOf("/") + 1)
      };
    }
    throw new Error(
      "nodetool: a model is required — pass a nodetool.models.find/pick " +
      'result, {provider, model_id}, or "provider/model_id". Use ' +
      'await nodetool.models.pick("<capability>") to resolve one.'
    );
  };

  const api = {
    /**
     * Credentials, through the one bridge that has them.
     *
     * \`getSecret\` answers \`undefined\` for a secret nobody configured, which
     * turns a missing key into a 401 three calls later. These throw at the
     * point the credential was needed and name it.
     */
    secrets: {
      /** A secret's value, or an error naming the one that is not set. */
      async get(name) {
        if (typeof name !== "string" || name === "") {
          throw new Error("nodetool.secrets.get: a secret name is required");
        }
        if (typeof getSecret !== "function") {
          throw new Error(
            'nodetool.secrets.get("' + name + '"): this run has no secret store'
          );
        }
        const value = await getSecret(name);
        if (value === undefined || value === null || value === "") {
          throw new Error(
            'nodetool.secrets.get("' + name + '"): not set. Add it under ' +
            "Settings > Secrets, or on the node's secret scope."
          );
        }
        return value;
      },
      /** The value, or undefined — for a credential that is genuinely optional. */
      async tryGet(name) {
        if (typeof getSecret !== "function") return undefined;
        const value = await getSecret(name);
        return value === null || value === "" ? undefined : value;
      },
      /**
       * The names this node declared, or null when it declared no scope and
       * may read the whole store. Reading this is not the check: a name
       * outside the scope is refused by the bridge, not by this list.
       */
      list() {
        return typeof __secretScope === "undefined" || __secretScope === null
          ? null
          : __secretScope.slice();
      }
    },

    /**
     * Find a tool the prompt lists by name only, or does not list at all.
     * Takes the ToolSearch grammar ("select:a,b" for exact names, "+term" to
     * require one) and returns each match's name, signature and description.
     * Call it before calling a tool whose arguments you have not seen.
     */
    async searchTools(query, maxResults) {
      if (typeof __searchTools !== "function") {
        throw new Error(
          "nodetool.searchTools: this run has no tool catalog to search."
        );
      }
      const r = await __searchTools(
        String(query === undefined || query === null ? "" : query),
        maxResults === undefined ? 5 : maxResults
      );
      if (!r || r.ok !== true) {
        throw new Error(r && r.error ? r.error : "nodetool.searchTools failed");
      }
      return r.result;
    },

    /**
     * What this action can import: the sandbox packs installed here, the
     * modules each declares, the functions those export, and each pack's own
     * documentation. A pack marked allowed:false is installed but off this
     * session's allowlist — importing it is refused.
     */
    packs: (() => {
      let cached = null;
      const load = async (refresh) => {
        if (cached === null || refresh === true) {
          cached = await __need("list_sandbox_packages")({});
        }
        return cached;
      };
      const packOf = (entry) => entry.packName;
      return {
        /**
         * One entry per pack: {packName, description, allowed, kinds,
         * specifiers}. Pass {refresh: true} to re-read the catalog.
         */
        async list(opts) {
          const listing = await load(opts && opts.refresh);
          const byPack = {};
          const order = [];
          for (const entry of listing.packages) {
            const name = packOf(entry);
            if (byPack[name] === undefined) {
              byPack[name] = {
                packName: name,
                packVersion: entry.packVersion,
                description: entry.description || "",
                allowed: false,
                kinds: [],
                specifiers: []
              };
              order.push(name);
            }
            const pack = byPack[name];
            if (!pack.description && entry.description) {
              pack.description = entry.description;
            }
            if (entry.allowed) pack.allowed = true;
            if (pack.kinds.indexOf(entry.kind) < 0) pack.kinds.push(entry.kind);
            pack.specifiers.push(entry.specifier);
          }
          const packs = order.map((name) => byPack[name]);
          if (listing.platform && listing.platform.length > 0) {
            packs.push({
              packName: "@nodetool-ai/sandbox-nodetool",
              description:
                "NodeTool's own surface — the same gated calls as nodetool.*.",
              allowed: true,
              kinds: ["platform"],
              specifiers: listing.platform.map((entry) => entry.specifier)
            });
          }
          return packs;
        },
        /**
         * The importable module specifiers of one pack, each with its kind and
         * whether this session allows it. Takes a pack name or any specifier
         * inside the pack.
         */
        async modules(pack, opts) {
          const listing = await load(opts && opts.refresh);
          const name = String(pack === undefined || pack === null ? "" : pack);
          const platform = (listing.platform || []).filter(
            (entry) => entry.specifier === name || entry.specifier.indexOf(name) === 0
          );
          if (platform.length > 0) {
            return platform.map((entry) => ({
              specifier: entry.specifier,
              kind: "platform",
              allowed: true
            }));
          }
          return listing.packages
            .filter(
              (entry) =>
                packOf(entry) === name ||
                entry.specifier === name ||
                entry.specifier.indexOf(name + "/") === 0
            )
            .map((entry) => ({
              specifier: entry.specifier,
              kind: entry.kind,
              description: entry.description,
              allowed: entry.allowed
            }));
        },
        /**
         * The function names one module exports: {specifier, kind, exports,
         * complete, note?}. A module whose exports cannot be read answers
         * exports:null with the reason in note — read docs() instead of
         * guessing.
         */
        exports(specifier) {
          return __need("list_sandbox_packages")({
            specifier: String(specifier === undefined ? "" : specifier)
          });
        },
        /** A pack's SKILL.md, for the specifier you are about to import. */
        docs(specifier) {
          return __need("get_sandbox_package_docs")({
            specifier: String(specifier === undefined ? "" : specifier)
          });
        }
      };
    })(),

    /** What this belt supports, namespace by namespace. */
    capabilities() {
      const caps = {};
      const groups = __NT_NAMESPACE_TOOLS;
      for (const ns of Object.keys(groups)) {
        const present = groups[ns].filter(__has);
        if (present.length > 0) caps[ns] = present;
      }
      return caps;
    },

    /**
     * Bounded-concurrency map. Returns one settled entry per item:
     * { ok, index, item, value | error }. Never throws; failures are entries.
     * Respect the per-action tool-call budget: chunk large item lists across
     * actions and carry progress in \`state\`.
     */
    async batch(items, fn, opts) {
      const list = Array.from(items);
      const width = Math.max(
        1,
        Math.min(8, (opts && opts.concurrency) || 4)
      );
      const stopOnError = !!(opts && opts.stopOnError);
      const results = new Array(list.length);
      let next = 0;
      let stopped = false;
      const worker = async () => {
        while (next < list.length && !stopped) {
          const i = next++;
          try {
            results[i] = {
              ok: true,
              index: i,
              item: list[i],
              value: await fn(list[i], i)
            };
          } catch (e) {
            results[i] = {
              ok: false,
              index: i,
              item: list[i],
              error: e && e.message ? e.message : String(e)
            };
            if (stopOnError) stopped = true;
          }
        }
      };
      const workers = [];
      for (let w = 0; w < Math.min(width, list.length); w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
      return results.filter((entry) => entry !== undefined);
    },

    nodes: {
      /**
       * Search the node catalog. \`query\` takes a string or an array of
       * strings; \`opts\` passes n_results / input_type / output_type through.
       * Answers { total, results }; a result's node type is on "type".
       */
      search: (query, opts) =>
        __need("search_nodes")(
          __merge(opts, {
            query: Array.isArray(query) ? query : [String(query)]
          })
        ),
      /** Full metadata for ONE node type: properties, inputs, outputs. */
      info: (type) => __need("get_node_info")({ node_type: type }),
      list: (opts) => __need("list_nodes")(__merge(opts)),
      /**
       * The single-node harness: run ONE node by type with a property bag,
       * no workflow needed. The cheap way to probe what a node does before
       * wiring it into a graph.
       */
      run: (type, inputs) =>
        __need("run_node")({ node_type: type, inputs: inputs || {} })
    },

    agents: {
      /**
       * Run a sub-agent on a self-contained prompt and return its result.
       * The child inherits this belt's tools but sees NONE of this
       * conversation — put everything it needs into the prompt, and ask for
       * JSON there when you want structure. Runs take real time and money;
       * delegate work that benefits from a fresh focused context, not
       * one-tool errands.
       */
      run(prompt, opts) {
        const text = String(prompt === undefined || prompt === null ? "" : prompt);
        const description =
          (opts && opts.description) ||
          text.split(/\\s+/).slice(0, 6).join(" ") ||
          "Subtask";
        return __need("run_subtask")({ description: description, prompt: text });
      }
    },

    workflows: {
      list: (opts) => __need("list_workflows")(__merge(opts)),
      get: (id) => __need("get_workflow")({ workflow_id: id }),
      create: (name, graph, opts) =>
        __need("create_workflow")(
          __merge(opts, { name: name, graph: __graphJson(graph) })
        ),
      run: (id, params, opts) =>
        __need("run_workflow")(
          __merge(opts, { workflow_id: id, params: params || {} })
        ),
      start: (id, params) =>
        __need("start_background_job")({
          workflow_id: id,
          params: params || {}
        }),
      debug: (id, params, opts) =>
        __need("debug_workflow")(
          __merge(opts, { workflow_id: id, params: params || {} })
        ),
      validate: (target) =>
        typeof target === "string"
          ? __need("validate_workflow")({ workflow_id: target })
          : __need("validate_workflow")({ graph: __graphJson(target) }),
      /**
       * Answer an escalation from an interactive run/debug. Action is one of
       * the escalation's allowedActions; pass {outputs} with "substitute",
       * {reason} with "fail", {apply_to: "signature"} to resolve every later
       * failure with the same signature. Returns the NEXT escalation (answer
       * it the same way) or the run's final report.
       */
      resolve: (sessionId, escalationId, action, opts) =>
        __need("resolve_workflow_escalation")(
          __merge(opts, {
            session_id: sessionId,
            escalation_id: escalationId,
            action: action
          })
        ),
      /**
       * One example workflow, graph included — a worked graph to read before
       * authoring one. Name is "<package>/<example>", or pass the package
       * separately as {package}.
       */
      example(name, opts) {
        const explicit = (opts && (opts.package || opts.package_name)) || "";
        let pkg = explicit;
        let example = String(name || "");
        if (!explicit) {
          const slash = example.indexOf("/");
          if (slash > 0) {
            pkg = example.slice(0, slash);
            example = example.slice(slash + 1);
          } else {
            pkg = "nodetool-base";
          }
        }
        if (!example) {
          throw new Error(
            "nodetool.workflows.example: name an example — " +
            '"<package>/<example>", or (example, {package}). ' +
            'nodetool.workflows.list({workflow_type: "example"}) lists them.'
          );
        }
        return __need("get_example_workflow")({
          package_name: pkg,
          example_name: example
        });
      },
      open(id) {
        if (typeof openWorkflow !== "function") {
          throw new Error(
            "nodetool.workflows.open: the graph editing tools (ui_*) are " +
            "not in this toolbelt. Author a graph with the sandbox DSL " +
            "package instead, then create() it."
          );
        }
        return openWorkflow(id);
      }
    },

    models: {
      find: (capability, opts) =>
        __need("find_model")(__merge(opts, { capability: capability })),
      /**
       * Resolve ONE model for a capability — the top-ranked hit, ready to
       * pass to nodetool.media.*. To put it in a node's model property,
       * assign the result's "ref" field verbatim (the flat fields use
       * "model_id"; the property wants "id"). Throws when no configured
       * provider offers the capability.
       */
      async pick(capability, opts) {
        const found = await __need("find_model")(
          __merge(opts, { capability: capability, limit: 1 })
        );
        const results = (found && found.results) || [];
        if (results.length === 0) {
          throw new Error(
            'nodetool.models.pick: no configured model offers "' +
              capability +
              '"' +
              (found && found.note ? " — " + found.note : "")
          );
        }
        // A missed search must not resolve to an unrelated model — the caller
        // asked for a named one.
        if (found && found.query_matched === false) {
          throw new Error(
            "nodetool.models.pick: no model matches " +
              JSON.stringify(opts && opts.query) +
              " for " +
              capability +
              '. Call nodetool.models.find("' +
              capability +
              '") to see what is configured.'
          );
        }
        return results[0];
      },
      list: (opts) => __need("list_models")(__merge(opts)),
      /** One provider's own catalog. */
      forProvider: (provider, opts) =>
        __need("list_provider_models")(__merge(opts, { provider: provider }))
    },

    media: {
      generateImage: (prompt, model, opts) =>
        __need("generate_image")(
          __merge(opts, __merge(__model(model), { prompt: prompt }))
        ),
      editImage: (inputFile, prompt, model, opts) =>
        __need("edit_image")(
          __merge(
            opts,
            __merge(__model(model), { input_file: inputFile, prompt: prompt })
          )
        ),
      /**
       * Promote an image handle (or a generation result) to a durable asset.
       * Bytes stay on the host; the guest only sees the asset:// ref.
       */
      toImage: (src, opts) => image.toAsset(src, opts),
      /** Promote an audio handle to a durable asset. */
      toAudio: (src, opts) => audio.toAsset(src, opts),
      /** Promote a video handle to a durable asset. */
      toVideo: (src, opts) => video.toAsset(src, opts),
      generateVideo: (prompt, model, opts) =>
        __need("generate_video")(
          __merge(opts, __merge(__model(model), { prompt: prompt }))
        ),
      animateImage: (inputFile, model, opts) =>
        __need("animate_image")(
          __merge(opts, __merge(__model(model), { input_file: inputFile }))
        ),
      speak: (text, model, opts) =>
        __need("generate_speech")(
          __merge(opts, __merge(__model(model), { text: text }))
        ),
      transcribe: (inputFile, model, opts) =>
        __need("transcribe_audio")(
          __merge(opts, __merge(__model(model), { input_file: inputFile }))
        ),
      embed: (text, model, opts) =>
        __need("embed_text")(
          __merge(opts, __merge(__model(model), { text: text }))
        ),
      /**
       * Judge one image against the brief with a VISION chat model (pick
       * "generate_message" on a vision-capable model). Returns a verdict plus
       * directional defects — feed the fixes back into generateImage.
       */
      critique: (image, brief, model, opts) =>
        __need("critique_image")(
          __merge(
            opts,
            __merge(__model(model), { image: image, brief: brief })
          )
        ),
      /** Pick the best of 2-8 candidates by pairwise knockout. */
      compare: (images, brief, model, opts) =>
        __need("compare_images")(
          __merge(
            opts,
            __merge(__model(model), { images: images, brief: brief })
          )
        ),
      /** Explainable adherence score: the brief as binary yes/no checks. */
      scoreAdherence: (image, brief, model, opts) =>
        __need("score_image_adherence")(
          __merge(
            opts,
            __merge(__model(model), { image: image, brief: brief })
          )
        ),
      /** Run ffmpeg on workspace files. \`args\` is argv after the binary name. */
      ffmpeg: (args, opts) => __need("ffmpeg")(__merge(opts, { args: args })),
      /** Download a video with yt-dlp. */
      downloadVideo: (url, outputFile, opts) =>
        __need("yt_dlp")(__merge(opts, { url: url, output_file: outputFile }))
    },

    documents: {
      convert: (inputFile, outputFile, opts) =>
        __need("convert_document")(
          __merge(opts, { input_file: inputFile, output_file: outputFile })
        ),
      extractText: (inputFile, opts) =>
        __need("extract_pdf_text")(__merge(opts, { path: inputFile })),
      extractTables: (inputFile, outputFile, opts) =>
        __need("extract_pdf_tables")(
          __merge(opts, { path: inputFile, output_file: outputFile })
        ),
      markdownToPdf: (inputFile, outputFile, opts) =>
        __need("convert_markdown_to_pdf")(
          __merge(opts, { input_file: inputFile, output_file: outputFile })
        ),
      pdfToMarkdown: (inputFile, outputFile, opts) =>
        __need("convert_pdf_to_markdown")(
          __merge(opts, { input_file: inputFile, output_file: outputFile })
        )
    },

    web: {
      /**
       * Search the web. \`web_search\` routes across the configured backends
       * host-side; \`opts.provider\` pins one — "default", "openai", "google"
       * (grounded/Gemini), "dataforseo".
       */
      search: (query, opts) =>
        __need("web_search")(
          __webArgs(opts, { google: "gemini" }, "query", query)
        ),
      news: (query, opts) =>
        __need("google_news")(
          __webArgs(opts, { google: "serpapi" }, "keyword", query)
        ),
      images: (query, opts) =>
        __need("google_images")(
          __webArgs(opts, { google: "serpapi" }, "keyword", query)
        ),
      /** One HTTP request; returns the response body as text. */
      fetch: (url, opts) => __need("http_request")(__merge(opts, { url: url })),
      /** Fetch a page and get its readable text (HTML stripped). */
      browse: (url) => __need("browser")({ url: url }),
      /** Save a URL's bytes into the workspace. */
      download: (url, outputFile) =>
        __need("download_file")({ url: url, output_file: outputFile }),
      /** Render a page in a remote browser and save the PNG. */
      screenshot: (url, outputFile) =>
        __need("take_screenshot")({
          url: url,
          output_file: outputFile || "screenshot.png"
        })
    },

    memory: {
      /** Remember something durably in THIS conversation. */
      save: (content, opts) =>
        __need("thread_memory_save")(__merge(opts, { content: content })),
      list: (opts) => __need("thread_memory_list")(__merge(opts)),
      update: (memoryId, fields) =>
        __need("thread_memory_update")(
          __merge(fields, { memory_id: memoryId })
        ),
      remove: (memoryId) =>
        __need("thread_memory_delete")({ memory_id: memoryId })
    },

    threads: {
      /** Past conversations, most recently updated first. */
      list: (opts) => __need("list_threads")(__merge(opts)),
      /** One thread and a page of its messages. */
      get: (threadId, opts) =>
        __need("get_thread")(__merge(opts, { thread_id: threadId })),
      /** The newest message in a thread, or undefined when it has none. */
      last: (threadId) =>
        __need("get_thread")({
          thread_id: threadId,
          limit: 1,
          newest_first: true
        }).then((t) => (t && t.messages ? t.messages[0] : undefined)),
      /** One message in full — untruncated content and every tool call. */
      message: (messageId) =>
        __need("get_message")({ message_id: messageId })
    },

    shared: {
      /** Metadata for every entry this run shares — no values. */
      list: (opts) => __need("list_shared")(__merge(opts)),
      /** Full values for the keys you name; misses come back in \`missing\`. */
      read: (keys) =>
        __need("read_shared")({
          keys: Array.isArray(keys) ? keys : [keys]
        }),
      /** Publish under \`shared:<key>\` for the rest of this run to find. */
      publish: (key, value, opts) =>
        __need("share_result")(__merge(opts, { key: key, value: value }))
    },

    email: {
      search: (opts) => __need("search_email")(__merge(opts)),
      archive: (messageIds) =>
        __need("archive_email")({
          message_ids: Array.isArray(messageIds) ? messageIds : [messageIds]
        }),
      label: (messageId, label) =>
        __need("add_label_to_email")({ message_id: messageId, label: label })
    },

    style: {
      /**
       * The user's accumulated taste as a prompt-ready block: a string, which
       * is what generation prompts and \`taste_profile\` take.
       */
      profile: (opts) =>
        __need("get_style_profile")(__merge(opts)).then((r) =>
          r && typeof r === "object" && typeof r.profile === "string"
            ? r.profile
            : r
        ),
      /** Record one preference learned from a choice or a correction. */
      record: (takeaway, opts) =>
        __need("record_style_preference")(
          __merge(opts, { takeaway: takeaway })
        )
    },

    assets: {
      list: (opts) => __need("list_assets")(__merge(opts)),
      /** Image assets as lightweight handles — feed an id to view_image. */
      images: (opts) => __need("list_images")(__merge(opts)),
      search: (query, opts) =>
        __need("asset_search")(__merge(opts, { query: query })),
      get: (id) => __need("get_asset")({ asset_id: id }),
      save: (name, opts) => __need("save_asset")(__merge(opts, { name: name })),
      read: (name, opts) => __need("read_asset")(__merge(opts, { name: name }))
    },

    jobs: {
      list: (opts) => __need("list_jobs")(__merge(opts)),
      get: (id) => __need("get_job")({ job_id: id }),
      logs: (id, opts) => __need("get_job_logs")(__merge(opts, { job_id: id })),
      /**
       * Poll a background job until it settles, then return the job record.
       * Terminal statuses are completed / failed / cancelled / error (the
       * jobs API's own terminal set). Throws after timeoutMs, naming the job
       * and the last status seen.
       */
      async wait(id, opts) {
        const pollMs = Math.max(1000, (opts && opts.pollMs) || 3000);
        const timeoutMs = (opts && opts.timeoutMs) || 600000;
        const terminal = ["completed", "failed", "cancelled", "error"];
        const deadline = Date.now() + timeoutMs;
        let status = "unknown";
        for (;;) {
          const job = await api.jobs.get(id);
          status = (job && (job.status || job.state)) || "unknown";
          if (terminal.indexOf(status) >= 0) return job;
          if (Date.now() >= deadline) {
            throw new Error(
              "nodetool.jobs.wait: job " + id + " did not finish within " +
              timeoutMs + "ms (last status: " + status + "). Poll it with " +
              "nodetool.jobs.get(id) or read nodetool.jobs.logs(id)."
            );
          }
          await sleep(pollMs);
        }
      }
    },

    collections: {
      list: () => __need("list_collections")({}),
      query: (collection, query, opts) =>
        __need("query_collection")(
          __merge(opts, { collection: collection, query: query })
        ),
      /** Index one chunk under a source id (re-indexing the same id updates it). */
      index: (text, sourceId, opts) =>
        __need("vector_index")(
          __merge(opts, { text: text, source_id: sourceId })
        ),
      /** Index many at once: [{text, source_id, metadata?}, ...]. */
      indexBatch: (chunks, opts) =>
        __need("vector_batch_index")(__merge(opts, { chunks: chunks })),
      /** Semantic search over the indexed chunks. */
      search: (text, opts) =>
        __need("vector_text_search")(__merge(opts, { text: text })),
      /** Semantic + keyword search fused by reciprocal rank. */
      hybridSearch: (text, opts) =>
        __need("vector_hybrid_search")(__merge(opts, { text: text }))
    },

    apps: {
      /** Validate + simulate a saved app. {run: false} is the free check. */
      debug: (id, opts) =>
        __need("debug_app")(__merge(opts, { application_id: id }))
    },

    timelines: {
      list: (opts) => __need("list_timelines")(__merge(opts)),
      versions: (id, opts) =>
        __need("list_timeline_versions")(__merge(opts, { timeline_id: id })),
      getVersion: (id, version) =>
        __need("get_timeline_version")({ timeline_id: id, version: version }),
      snapshot: (id, opts) =>
        __need("create_timeline_version")(__merge(opts, { timeline_id: id })),
      restore: (id, version) =>
        __need("restore_timeline_version")({
          timeline_id: id,
          version: version
        }),
      validate: (target) =>
        typeof target === "string"
          ? __need("validate_timeline")({ timeline_id: target })
          : __need("validate_timeline")({ document: target }),
      /** Apply document edits to a saved sequence, server-side. */
      edit: (id, ops) => __need("edit_timeline")({ timeline_id: id, ops: ops })
    },

    sketches: {
      list: (opts) => __need("list_sketches")(__merge(opts)),
      versions: (id, opts) =>
        __need("list_sketch_versions")(
          __merge(opts, { image_document_id: id })
        ),
      getVersion: (id, version) =>
        __need("get_sketch_version")({
          image_document_id: id,
          version: version
        }),
      snapshot: (id, opts) =>
        __need("create_sketch_version")(
          __merge(opts, { image_document_id: id })
        ),
      restore: (id, version) =>
        __need("restore_sketch_version")({
          image_document_id: id,
          version: version
        }),
      validate: (target) =>
        typeof target === "string"
          ? __need("validate_sketch")({ image_document_id: target })
          : __need("validate_sketch")({ document: target }),
      /** Apply layer-structure edits to a saved sketch, server-side. */
      edit: (id, ops) =>
        __need("edit_sketch")({ image_document_id: id, ops: ops })
    },

    scripts: {
      list: (opts) => __need("list_scripts")(__merge(opts)),
      get: (id) => __need("get_script")({ script_id: id }),
      voice: (id, opts) =>
        __need("voice_script_lines")(__merge(opts, { script_id: id })),
      assembleTimeline: (id, opts) =>
        __need("assemble_script_timeline")(__merge(opts, { script_id: id })),
      /** Apply cast/line edits to a saved script, server-side. */
      edit: (id, ops) => __need("edit_script")({ script_id: id, ops: ops })
    },

    storyboards: {
      list: (opts) => __need("list_storyboards")(__merge(opts)),
      get: (id) => __need("get_storyboard")({ storyboard_id: id }),
      renderStills: (id, opts) =>
        __need("render_storyboard_stills")(
          __merge(opts, { storyboard_id: id })
        ),
      renderClips: (id, opts) =>
        __need("render_storyboard_clips")(__merge(opts, { storyboard_id: id })),
      reviseClip: (id, target, instruction, opts) =>
        __need("revise_storyboard_clip")(
          __merge(opts, {
            storyboard_id: id,
            target: target,
            instruction: instruction
          })
        ),
      assembleTimeline: (id, opts) =>
        __need("assemble_storyboard_timeline")(
          __merge(opts, { storyboard_id: id })
        ),
      /** Apply shot-list edits to a saved board, server-side. */
      edit: (id, ops) => __need("edit_storyboard")({ storyboard_id: id, ops: ops })
    }
  };
  return api;
})();
`;

/** The namespace→tools map, serialized once for the guest's capabilities(). */
const NAMESPACE_TOOLS_LITERAL = `const __NT_NAMESPACE_TOOLS = ${JSON.stringify(
  NODETOOL_API_NAMESPACE_TOOLS
)};`;

/** The full prelude: namespace map, graph normalizer, API definition. */
export const NODETOOL_API_PRELUDE_FULL = `${NAMESPACE_TOOLS_LITERAL}\n${GRAPH_JSON_PRELUDE}\n${NODETOOL_API_PRELUDE}`;

/** Guest names {@link NODETOOL_API_PRELUDE_FULL} defines. */
export const NODETOOL_API_GLOBALS = [
  "nodetool",
  "__NT_NAMESPACE_TOOLS",
  "__graphJsonOf"
] as const;

interface PromptEntry {
  /** Namespace key in {@link NODETOOL_API_NAMESPACE_TOOLS}. */
  namespace: string;
  /** Rendered doc lines for the prompt. */
  doc: string;
}

const NAMESPACE_DOCS: PromptEntry[] = [
  {
    namespace: "workflows",
    doc: `- \`nodetool.workflows\` — \`list()\` returns \`{workflows}\`
  (an envelope, not a bare array), \`get(id)\`, \`run(id, params, {interactive})\`,
  \`start(id, params)\` (background job), \`debug(id, params)\`, \`validate(idOrGraph)\`,
  \`create(name, graph, {description, tags})\`, \`open(id?)\` (the editable object
  model — see the graph-editing section). An interactive run returns an
  escalation: answer it with \`resolve(sessionId, escalationId, action,
  {outputs, reason, apply_to})\` — retry/substitute/skip/end_stream/fail — and
  get the next escalation or the final report. Write the whole
  run-and-resolve loop (\`while (report.status === "escalated") ...\`) in one
  action. \`list({workflow_type: "example"})\` enumerates the shipped
  example workflows and \`example("<package>/<name>")\` loads one with its
  graph — a worked example to read before authoring one.`
  },
  {
    namespace: "nodes",
    doc: `- \`nodetool.nodes\` — the graph author's discovery half. \`search_nodes\`,
  \`get_node_info\` and \`list_nodes\` are direct tool calls — reach for those
  when you are only looking something up; these are the same lookups inside an
  action. NEVER guess a node
  type: \`await search(["summarize text"], {n_results, input_type, output_type})\`
  (a bare string works too) to find candidates — it returns
  \`{total, results}\`, and each result carries its node type on \`type\`
  (not \`node_type\`) — then
  \`await info("nodetool.text.Concat")\` for the exact properties, inputs and
  outputs before you import that node's namespace from the DSL package.
  \`list({namespace, limit})\`
  browses a namespace. \`run(type, inputs)\` is the single-node harness — probe
  one node with a property bag before wiring it into a graph.`
  },
  {
    namespace: "agents",
    doc: `- \`nodetool.agents\` — delegate to sub-agents. \`await run(prompt, {description})\`
  spawns a child with this belt's tools but a FRESH context: the prompt must be
  self-contained (ask for JSON in it when you want structure back). Fan out
  with \`nodetool.batch(prompts, (p) => nodetool.agents.run(p))\` — one
  settled \`{ok, value | error}\` entry per prompt. Delegate work that benefits
  from a fresh focused context, not one-tool errands.`
  },
  {
    namespace: "models",
    doc: `- \`nodetool.models\` — model discovery. \`find_model\` / \`list_models\` are
  direct tool calls, so a plain lookup is one call and not an action; these are
  the same lookups from inside an action, where a picked model feeds the next
  call. \`await pick(capability)\` resolves ONE ranked model
  (e.g. \`pick("text_to_image")\` → \`{provider, model_id, ref}\`). When the user
  named a model, search for it in the SAME call:
  \`pick("text_to_image", {query: "flux schnell"})\` — \`query\` is free text over
  model id and name, and \`pick\` throws when nothing matches instead of
  returning something else. \`find(capability,
  {query, provider_hint, prefer_local, limit})\` for the ranked list (returns
  \`{results}\`),
  \`list({provider, model_type})\` to browse, \`forProvider(provider)\` for one
  provider's own catalog. Never guess a model id — pick one, then pass it to
  \`nodetool.media.*\`. To set a node's model property, assign the result's
  \`ref\` verbatim (it is the typed \`{type, provider, id, name}\` value the
  property wants — the flat \`model_id\` field does not fit).`
  },
  {
    namespace: "media",
    doc: `- \`nodetool.media\` — direct generation, no workflow needed. Each call takes a
  model from \`nodetool.models.pick/find\` (or \`{provider, model_id}\`):
  \`generateImage(prompt, model, {width, height, output_file})\`,
  \`editImage(inputFile, prompt, model)\`, \`generateVideo(prompt, model)\`,
  \`animateImage(inputFile, model)\`, \`speak(text, model, {voice})\`,
  \`transcribe(inputFile, model)\`, \`embed(text, model)\`. Results are saved as
  assets (\`asset://\` URI); pass \`output_file\` for a workspace copy too.
  Assign each result to \`state\` before the next call
  (\`state.clip = state.clip ?? await nodetool.media.generateVideo(prompt, model)\`)
  so a later failure does not re-run generation. Feed generation results
  straight into \`image.*\`, \`audio.*\`, or \`video.*\`. These namespaces take a
  result, its \`asset_uri\`, or an asset id and return run-local handles. They
  can combine media too: for example, \`video.addAudio(videoHandle, audioHandle)\`.
  Save finished handles with \`nodetool.media.toImage/toAudio/toVideo\` before
  the action ends; keep the returned \`asset://\` ref in \`state\`. Do not pull
  bytes into the guest, and do not keep a handle in \`state\` because it is
  dead in the next action.
  Judging lives here too, so generate → critique → regenerate is one namespace:
  \`critique(image, brief, visionModel, {taste_profile})\`,
  \`compare([imageA, imageB, ...], brief, visionModel)\` (pairwise knockout),
  \`scoreAdherence(image, brief, visionModel, {questions})\`. The judge takes a
  VISION chat model — \`pick("generate_message")\` on a vision-capable one, not
  the image model that generated the picture.
  Host binaries: \`ffmpeg(args, {output_file, timeout_seconds})\` runs ffmpeg
  in the workspace (no shell); \`downloadVideo(url, outputFile, {format,
  timeout_seconds})\` downloads with yt-dlp. Browse pages with
  \`nodetool.web.browse(url)\`.`
  },
  {
    namespace: "documents",
    doc: `- \`nodetool.documents\` — file-to-file document conversion (Pandoc/PDF), paths
  relative to the workspace: \`convert(inputFile, outputFile, {from_format,
  to_format, extra_args})\`, \`extractText(pdfPath, {start_page, end_page})\`
  (returns \`{text}\`), \`extractTables(pdfPath, outputJsonFile)\`,
  \`markdownToPdf(inputFile, outputFile)\`, \`pdfToMarkdown(inputFile, outputFile)\`.`
  },
  {
    namespace: "web",
    doc: `- \`nodetool.web\` — the outside world. \`await search(query, {provider})\`,
  \`news(query)\` and \`images(query)\` route across the configured search
  backends host-side; \`provider\` pins one (\`"default"\`, \`"openai"\`,
  \`"google"\`, \`"dataforseo"\`). \`browse(url)\` returns a page's
  readable text, \`fetch(url, {method, headers, body})\` is a raw HTTP request,
  \`download(url, outputFile)\` saves bytes into the workspace, and
  \`screenshot(url, outputFile)\` renders a page to PNG.`
  },
  {
    namespace: "memory",
    doc: `- \`nodetool.memory\` — durable notes for THIS conversation, shown back to you
  at the start of each turn. \`save(content, {title, kind, resources})\` —
  put the assets, workflows and collections you produce in \`resources\` so you
  can reuse them later — plus \`list({limit})\`, \`update(memoryId, {content,
  title, resources})\`, and \`remove(memoryId)\`.`
  },
  {
    namespace: "threads",
    doc: `- \`nodetool.threads\` — the chat history, read-only. \`list({limit,
  workflow_id, cursor})\` returns past conversations newest first, each with
  its last message; \`get(threadId, {limit, newest_first, cursor, max_chars})\`
  reads a page of messages; \`last(threadId)\` is the newest one; and
  \`message(messageId)\` is the full record when a summarized message is not
  enough. Use it to answer "what did we decide last time" instead of asking
  the user to repeat it.`
  },
  {
    namespace: "shared",
    doc: `- \`nodetool.shared\` — the scratchpad for THIS run, gone when it ends (use
  \`nodetool.memory\` for anything that must outlive it). \`list({kind,
  key_prefix, sources})\` returns metadata only — keys, titles, kinds, byte
  sizes — so discovery costs no tokens; \`read(keys)\` fetches the full values
  of the keys you name and reports misses in \`missing\`; \`publish(key, value,
  {title, description})\` stores under \`shared:<key>\` for later steps and
  sub-agents to find. Upstream step and task results land here, so read them
  rather than asking for them again.`
  },
  {
    namespace: "style",
    doc: `- \`nodetool.style\` — the user's accumulated taste. \`profile({query, k})\`
  returns a string block to inject into generation prompts and to pass as
  \`taste_profile\` to \`nodetool.media.critique/compare\`;
  \`record(takeaway, {chosen, rejected, brief})\` saves one preference
  whenever the user picks between candidates or corrects a style.`
  },
  {
    namespace: "email",
    doc: `- \`nodetool.email\` — \`search({subject, text, since_hours_ago, max_results})\`,
  \`archive(messageIds)\`, \`label(messageId, label)\`.`
  },
  {
    namespace: "assets",
    doc: `- \`nodetool.assets\` — \`list({content_type, limit})\`, \`search(query)\`,
  \`images({query, limit})\` (image handles — pass an id to \`view_image\`),
  \`get(assetId)\` (the row — no bytes), \`save(name, {content_base64,
  content_type})\`, \`read(nameOrUri)\` (an \`asset://\` URI, an asset id, a
  /api/storage/ key, or a stored file name → \`{content, content_base64}\`).
  To edit a generated image, pass the generation result to \`image.*\` and
  save with \`nodetool.media.toImage(handle).\``
  },
  {
    namespace: "jobs",
    doc: `- \`nodetool.jobs\` — \`list({workflow_id})\`, \`get(jobId)\`, \`logs(jobId)\`,
  \`await wait(jobId, {timeoutMs, pollMs})\` polls until the job settles
  (completed/failed/cancelled) and returns the job. Pair it with
  \`nodetool.workflows.start(id, params)\`: start the run, do other work, then
  \`wait\` on the job id instead of blocking on \`run()\`. \`wait\` replaces a
  \`get()\` polling loop — start, wait, and read the result in one action,
  never one \`get()\` per action.`
  },
  {
    namespace: "collections",
    doc: `- \`nodetool.collections\` — RAG, end to end. Index with
  \`index(text, sourceId, {metadata})\` or \`indexBatch([{text, source_id, metadata}],
  {base_metadata})\`, then retrieve with \`search(text, {n_results})\`,
  \`hybridSearch(text, {n_results, k_constant})\` (semantic + keyword), or
  \`query(collection, text, {n_results})\` against a named collection;
  \`list()\` shows what exists.`
  },
  {
    namespace: "apps",
    doc: `- \`nodetool.apps\` — \`debug(applicationId, {params, interact, run,
  poll})\` validates and simulates a saved app; \`{run: false}\` is the free,
  instant wiring check. Build an app by driving the \`ui_app_*\` editor tools
  and checking each change with \`{run: false}\`.`
  },
  {
    namespace: "timelines",
    doc: `- \`nodetool.timelines\` — \`list()\`, \`validate(idOrDocument)\`, \`versions(id)\`,
  \`getVersion(id, n)\`, \`snapshot(id, {name})\`, \`restore(id, n)\`, and
  \`edit(id, ops)\` — the cut itself, server-side: \`[{op: "add_track", type:
  "audio"}, {op: "add_text_clip", text: "Hi"}, {op: "split_clip", target:
  "shot", atMs: 3000}, {op: "animate_clip", target: "Hi", animations:
  [{role: "in", preset: "fade"}]}]\`. Start with \`{op: "get_state"}\` for ids.`
  },
  {
    namespace: "sketches",
    doc: `- \`nodetool.sketches\` — \`list()\`, \`validate(idOrDocument)\`, \`versions(id)\`,
  \`getVersion(id, n)\`, \`snapshot(id, {name})\`, \`restore(id, n)\`, and
  \`edit(id, ops)\` for layer structure server-side: \`[{op: "add_layer", name:
  "Shadow"}, {op: "set_layer_props", target: "Shadow", opacity: 0.4,
  blendMode: "multiply"}]\`. Pixels are never touched — painting and
  generation stay with an open editor or a workflow run.`
  },
  {
    namespace: "scripts",
    doc: `- \`nodetool.scripts\` — \`list()\`, \`get(id)\`, \`voice(id, {targets, provider,
  model, voice})\`, \`assembleTimeline(id)\`, and \`edit(id, ops)\` for the words
  themselves: \`[{op: "add_speaker", name: "Narrator"}, {op: "add_line", text:
  "Once upon a time.", speaker: "Narrator"}]\`. Rewriting a line leaves its
  takes stale, so \`voice()\` re-records exactly those.`
  },
  {
    namespace: "storyboards",
    doc: `- \`nodetool.storyboards\` — \`list()\`, \`get(id)\`, \`renderStills(id, {targets})\`,
  \`renderClips(id, {targets})\`, \`reviseClip(id, target, instruction)\`,
  \`assembleTimeline(id)\`, and \`edit(id, ops)\` for the shot list:
  \`[{op: "add_shot", action: "Wide of the lighthouse at dusk",
  duration_seconds: 4}, {op: "reorder_shot", target: "shot_2", index: 0}]\`.`
  }
];

const BATCH_EXAMPLE = `Batching turns one workflow into a dynamic pipeline — loops, joins, and
per-item parameters live in your code:

\`\`\`js
const rows = JSON.parse(await workspace.read("products.json"));
const runs = await nodetool.batch(rows, (row) =>
  nodetool.workflows.run(wfId, { image_url: row.image_url, title: row.title }),
  { concurrency: 3 });
state.failed = runs.filter((r) => !r.ok);
return { ok: runs.filter((r) => r.ok).length, failed: state.failed.length };
\`\`\`

\`nodetool.batch(items, fn, {concurrency, stopOnError})\` never throws — each
entry settles as \`{ok, index, item, value | error}\`. A handful of items is one
\`batch\` call in one action; only lists big enough to threaten the sandbox
limits get chunked across actions with progress in \`state\`.`;

const MEDIA_EXAMPLE = `Pick a model once, stash results in \`state\`, then generate —
batching included. Skip work \`state\` already holds:

\`\`\`js
const model = state.model ?? (state.model = await nodetool.models.pick("text_to_image"));
if (!state.images) {
  const shots = ["a red fox in snow", "a fox by a river"];
  const images = await nodetool.batch(shots, (prompt) =>
    nodetool.media.generateImage(prompt, model), { concurrency: 2 });
  state.images = images.map((r) => (r.ok ? r.value : null));
}
return state.images.map((img) => (img ? img.asset_uri : "failed"));
\`\`\``;

/**
 * The `nodetool` API section for codeact system prompts, documenting only the
 * namespaces this belt can actually serve. Empty string when none can.
 */
/** Client tool families that address a document open in the user's browser. */
const DOCUMENT_UI_TOOL_PREFIXES = [
  "ui_timeline_",
  "ui_sketch_",
  "ui_script_",
  "ui_storyboard_"
] as const;

const DOCUMENT_SURFACE_GUIDANCE = `# Editing documents: server-side first

A timeline, sketch, script, or storyboard that has an id is editable
server-side through \`nodetool.<surface>.edit(id, ops)\`. Prefer it. The edit
lands on the stored document under a compare-and-swap, works whether or not the
user has that document open, and an open editor picks the change up live — so
one path covers both cases.

Reach for a \`ui_*\` tool only for what a server-side edit cannot do:

- \`ui_sketch_get_layer_image\`, \`ui_sketch_render_to_asset\` — real pixels off
  the canvas.
- \`ui_timeline_get_clip_frames\` — rendered video frames.
- \`ui_sketch_generate\`, \`ui_timeline_generate_clip\`,
  \`ui_storyboard_generate_*\`, \`ui_script_voice_*\` — generation the browser
  drives. Headlessly these are \`nodetool.storyboards.renderStills/renderClips\`,
  \`nodetool.scripts.voice\`, \`nodetool.media.*\`, or a workflow run.
- Moving the user's view: selection, playhead, active tool.

If you do not know the document's id, find it with \`list()\` on the namespace.`;

/**
 * Heading of the prompt section {@link buildNodetoolApiPromptSection} renders.
 * `buildCodeActSystemPrompt` keys on it to know the `nodetool` object model is
 * loaded — and then documents `nodetool.batch` as THE fan-out primitive
 * instead of the bare-sandbox `parallelMap` helper.
 */
export const NODETOOL_API_SECTION_HEADER = "# The `nodetool` object model";

interface NodetoolApiPromptOptions {
  /**
   * Whether this session can author graphs with `@nodetool-ai/sandbox-dsl` —
   * the belt carries the three workflow verbs AND the pack is installed. The
   * caller decides it (`withGraphDslPackage`), because only the caller knows
   * the allowlist and the catalog.
   */
  graphDsl?: boolean;
}

export function buildNodetoolApiPromptSection(
  toolNames: Iterable<string>,
  options: NodetoolApiPromptOptions = {}
): string {
  const names = new Set(toolNames);
  const active = NAMESPACE_DOCS.filter((entry) =>
    NODETOOL_API_NAMESPACE_TOOLS[entry.namespace].some((tool) =>
      names.has(tool)
    )
  );
  if (active.length === 0) return "";

  const sections: string[] = [
    NODETOOL_API_SECTION_HEADER,
    `Platform objects — workflows, models, media, documents — are
driven through \`nodetool.*\`, not through raw \`tools.*\` calls. The backing
tools are deliberately absent from the tool catalog above; this object model
is their one documented surface. \`nodetool.capabilities()\` reports what is
available. A method whose backing tool is missing throws and names the tool.`,
    `The same capabilities are also importable, one module per namespace:
\`import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows"\`, or
\`import workflows from "@nodetool-ai/sandbox-nodetool/workflows"\` for the whole
namespace. Each export takes the one arguments object its tool takes. This is
the same gated implementation \`nodetool.*\` calls — \`nodetool.*\` stays
available, and the two cannot disagree. A module this session does not mount
fails the action by name, before any code runs.`,
    active.map((entry) => entry.doc).join("\n")
  ];
  if (options.graphDsl) sections.push(GRAPH_DSL_PROMPT_SECTION);
  if (names.has("find_model") && names.has("generate_image")) {
    sections.push(MEDIA_EXAMPLE);
  }
  if (names.has("run_workflow")) sections.push(BATCH_EXAMPLE);
  if (
    [...names].some((name) =>
      DOCUMENT_UI_TOOL_PREFIXES.some((p) => name.startsWith(p))
    )
  ) {
    sections.push(DOCUMENT_SURFACE_GUIDANCE);
  }
  return sections.join("\n\n");
}
