/**
 * The `nodetool` object model — the agent-facing JS API for the CodeAct
 * sandbox. Where an imported capability is the raw RPC surface, `nodetool.*` is the
 * platform as objects: workflows, models, assets,
 * jobs, collections, games, timelines, sketches, scripts, and storyboards, plus a
 * bounded-concurrency `batch()` for fan-out (run a workflow once per CSV row,
 * validate every timeline, render all boards).
 *
 * Every method is a thin wrapper over an existing belt tool, so permission
 * gating, routing, and validation stay where they are. A method whose backing
 * tool is missing from the belt throws a message naming the tool instead of a
 * TypeError. The prelude assumes `CODEACT_PRELUDE` ran first (it uses
 * the belt); `nodetool.workflows.open()` additionally uses `openWorkflow`
 * from the graph-model prelude when that is loaded.
 */

import { GRAPH_JSON_PRELUDE } from "../graph-dsl-core.js";
import {
  GRAPH_DSL_PACKAGE,
  GRAPH_DSL_PROMPT_SECTION
} from "./graph-dsl-package.js";
import { FLOW_PACKAGE, FLOW_PROMPT_SECTION } from "./flow-package.js";

/** Namespace → the belt tools that light it up (any one is enough). */
export const NODETOOL_API_NAMESPACE_TOOLS: Record<string, readonly string[]> = {
  workflows: [
    "list_workflows",
    "get_workflow",
    "create_workflow",
    "list_workflow_versions",
    "get_workflow_version",
    "create_workflow_version",
    "restore_workflow_version",
    "delete_workflow_version",
    "run_workflow",
    "start_background_job",
    "debug_workflow",
    "validate_workflow",
    "resolve_workflow_escalation",
    "get_example_workflow"
  ],
  // Documented in the sandbox-packages section rather than in the namespace
  // list, but covered here so the two discovery tools are not also catalogued
  // as raw catalog signatures.
  packs: ["list_sandbox_packages", "get_sandbox_package_docs"],
  nodes: ["search_nodes", "get_node_info", "list_nodes", "run_node"],
  agents: ["run_subtask", "start_subtask", "wait_subtasks"],
  models: [
    "find_model",
    "list_models",
    "list_provider_models",
    "generate_text"
  ],
  media: [
    "generate_image",
    "edit_image",
    "generate_video",
    "animate_image",
    "generate_video_from_references",
    "generate_speech",
    "generate_music",
    "transcribe_audio",
    "embed_text",
    "critique_image",
    "compare_images",
    "score_image_adherence",
    "understand_video",
    "ffmpeg",
    "ffprobe",
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
    "image_search",
    "http_request",
    "download_file",
    "browser",
    "take_screenshot"
  ],
  memory: [
    "memory_save",
    "memory_list",
    "memory_search",
    "memory_update",
    "memory_delete"
  ],
  shared: ["list_shared", "read_shared", "share_result"],
  threads: ["list_threads", "get_thread", "get_message"],
  email: ["search_email", "archive_email", "add_label_to_email"],
  settings: [
    "list_settings",
    "get_setting",
    "set_setting",
    "list_secrets",
    "request_secret"
  ],
  assets: [
    "list_assets",
    "get_asset",
    "asset_search",
    "save_asset",
    "read_asset",
    "list_images"
  ],
  jobs: ["list_jobs", "get_job", "get_job_logs"],
  generations: [
    "list_generations",
    "get_generation",
    "await_generation",
    "cancel_generation",
    "reconcile_generation",
    "list_provider_generations",
    "get_provider_generation"
  ],
  collections: [
    "list_collections",
    "query_collection",
    "vector_index",
    "vector_batch_index",
    "vector_text_search",
    "vector_hybrid_search"
  ],
  apps: ["list_apps", "get_app", "create_app", "edit_app", "debug_app"],
  games: [
    "create_native_game", "get_native_game", "edit_native_game", "publish_native_game",
    "install_native_game_asset", "playtest_native_game", "capture_native_game_frame",
    "generate_game_asset", "build_native_game", "list_example_games", "get_example_game",
    "install_example_game", "autoplay_native_game"
  ],
  timelines: [
    "list_timelines",
    "list_example_timelines",
    "get_example_timeline",
    "create_timeline",
    "get_timeline",
    "list_timeline_versions",
    "get_timeline_version",
    "create_timeline_version",
    "restore_timeline_version",
    "delete_timeline_version",
    "validate_timeline",
    "preview_timeline_frame",
    "compare_timeline_frames",
    "edit_timeline",
    "set_timeline_document",
    "render_timeline",
    "list_compositions",
    "get_composition",
    "save_composition",
    "delete_composition"
  ],
  sketches: [
    "list_sketches",
    "create_sketch",
    "get_sketch",
    "list_sketch_versions",
    "get_sketch_version",
    "create_sketch_version",
    "restore_sketch_version",
    "delete_sketch_version",
    "validate_sketch",
    "edit_sketch"
  ],
  scripts: [
    "list_scripts",
    "create_script",
    "get_script",
    "voice_script_lines",
    "assemble_script_timeline",
    "edit_script"
  ],
  storyboards: [
    "list_storyboards",
    "create_storyboard",
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
 * also document as raw catalog signatures. One surface per capability: wrapped
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
 * no host bridges of its own; every effect goes through `__callBeltTool`.
 */
export const NODETOOL_API_PRELUDE = `
const nodetool = (() => {
  // \`__toolNames\` is the belt, and the object model calls it through
  // \`__callBeltTool\` rather than through a global belt object — there is no
  // longer one for it to read.
  const __belt = new Set(__toolNames);
  const __has = (name) => __belt.has(name);
  const __need = (name) => {
    if (!__belt.has(name)) {
      throw new Error(
        'nodetool: tool "' + name + '" is not in this toolbelt, so this ' +
        "method is unavailable here. nodetool.searchTools() lists what is."
      );
    }
    return __callBeltTool(name);
  };
  const __merge = (a, b) => Object.assign({}, a || {}, b || {});

  /**
   * A \`create(name, opts)\` call's arguments, however the caller spelled them.
   * The documented form passes the name first, but a caller holding an options
   * bag reaches for \`create({name, ...})\` — and that used to arrive at the tool
   * as \`name: {name: "..."}\`, refused as "name is required and must be a
   * non-empty string". The message described the argument, not the call, so
   * there was nothing to correct against: a chat retried the same object shape
   * three times before falling back to the positional form by accident. Both
   * spellings are the same call, so both are accepted, and a name that is
   * genuinely missing is named as the caller's own argument.
   */
  const __named = (nameOrOpts, opts, method) => {
    const args =
      nameOrOpts && typeof nameOrOpts === "object"
        ? __merge(nameOrOpts, opts)
        : __merge(opts, { name: nameOrOpts });
    if (typeof args.name !== "string" || args.name.trim() === "") {
      throw new Error(
        "nodetool." + method + ": a name is required. Pass it first — " +
        'nodetool.' + method + '("My name", {...}) — or in the options ' +
        'object as {name: "My name"}.'
      );
    }
    return args;
  };

  /**
   * A job id from either an id or a job/receipt object. \`start()\` answers with
   * a record, and reaching for the wrong field on it used to reach the tool as
   * \`job_id: undefined\`, which came back as "Job undefined was not found" —
   * a message about a job rather than about the call that asked for it.
   */
  const __jobId = (idOrJob, method) => {
    if (typeof idOrJob === "string" && idOrJob) return idOrJob;
    if (idOrJob && typeof idOrJob === "object") {
      const id = idOrJob.job_id || idOrJob.id;
      if (typeof id === "string" && id) return id;
    }
    throw new Error(
      "nodetool.jobs." + method + ": no job id. Pass the id string, or the " +
      "record nodetool.workflows.start() returned (its id is job_id)."
    );
  };

  /** A generation id, or the record a generation capability answered with. */
  const __generationId = (idOrRecord, method) => {
    if (typeof idOrRecord === "string" && idOrRecord) return idOrRecord;
    if (idOrRecord && typeof idOrRecord === "object") {
      const id = idOrRecord.generation_id;
      if (typeof id === "string" && id) return id;
    }
    throw new Error(
      "nodetool.generations." + method + ": no generation id. Pass the id " +
      "string, or the record a generate* call returned (its id is generation_id)."
    );
  };

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
     * NodeTool's own configuration, and the one way to get a credential set.
     *
     * \`secrets\` above reads; this asks. \`requestSecret\` sends no value and
     * receives none — it opens a dialog where the user types the key, and
     * answers only whether they saved one.
     */
    settings: {
      /** Every non-secret setting, or one group's worth. */
      list: (opts) => __need("list_settings")(__merge(opts)),
      /** One setting's value, resolved from this user then the environment. */
      get: (key) => __need("get_setting")({ key: key }),
      /** Change one setting. Refuses a secret and anything undeclared. */
      set: (key, value) => __need("set_setting")({ key: key, value: value }),
      /** Which credentials exist, never what they are. */
      secrets: () => __need("list_secrets")({}),
      /** Ask the user to enter one, in a dialog you never see the contents of. */
      requestSecret: (key, opts) =>
        __need("request_secret")(__merge(opts, { key: key }))
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
        /** Returns a pack's SKILL.md as a markdown string. Untrusted docs retain their warning wrapper. */
        async docs(specifier) {
          const result = await __need("get_sandbox_package_docs")({
            specifier: String(specifier === undefined ? "" : specifier)
          });
          return result.documentation;
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
     * actions, persisting partial progress with \`nodetool.memory.save\`.
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
       * one-tool errands. Blocks until the child finishes; fan out with
       * \`Promise.all\` or \`nodetool.batch\`.
       */
      run(prompt, opts) {
        const text = String(prompt === undefined || prompt === null ? "" : prompt);
        const description =
          (opts && opts.description) ||
          text.split(/\\s+/).slice(0, 6).join(" ") ||
          "Subtask";
        return __need("run_subtask")({ description: description, prompt: text });
      },
      /**
       * Start a sub-agent WITHOUT blocking: returns
       * \`{subtask_id, status: "running"}\` right away while the child works.
       * Collect results later in the same action with \`wait()\` — results of
       * subtasks you never wait for are lost to the turn.
       */
      start(prompt, opts) {
        const text = String(prompt === undefined || prompt === null ? "" : prompt);
        const description =
          (opts && opts.description) ||
          text.split(/\\s+/).slice(0, 6).join(" ") ||
          "Subtask";
        return __need("start_subtask")({ description: description, prompt: text });
      },
      /**
       * Wait for background subagents started with \`start()\`. Pass
       * \`{ids: [...], timeoutMs}\` to bound the block. Resolves with rows:
       * \`{subtask_id, status, result | error}\`. Never end an action with
       * unwaited subtasks whose results you still need.
       */
      wait(opts) {
        return __need("wait_subtasks")(
          opts
            ? {
                ids: opts.ids,
                timeout_ms: opts.timeoutMs
              }
            : {}
        );
      }
    },

    workflows: {
      list: (opts) => __need("list_workflows")(__merge(opts)),
      get: (id) => __need("get_workflow")({ workflow_id: id }),
      create: (name, graph, opts) =>
        __need("create_workflow")(
          __merge(__named(name, opts, "workflows.create"), {
            graph: __graphJson(
              graph === undefined && name && typeof name === "object"
                ? name.graph
                : graph
            )
          })
        ),
      versions: (id, opts) =>
        __need("list_workflow_versions")(__merge(opts, { workflow_id: id })),
      getVersion: (id, version) =>
        __need("get_workflow_version")({ workflow_id: id, version: version }),
      snapshot: (id, opts) =>
        __need("create_workflow_version")(__merge(opts, { workflow_id: id })),
      restore: (id, version) =>
        __need("restore_workflow_version")({
          workflow_id: id,
          version: version
        }),
      deleteVersion: (id, version) =>
        __need("delete_workflow_version")({
          workflow_id: id,
          version: version
        }),
      run: (id, params, opts) =>
        __need("run_workflow")(
          __merge(opts, { workflow_id: id, params: params || {} })
        ),
      /**
       * Start a run and return a receipt — {job_id, id, status: "running"} —
       * without waiting for it. Pass it to nodetool.jobs.wait() and read the
       * settled job's outputs.
       */
      start: (id, params) =>
        __need("start_background_job")({
          workflow_id: id,
          params: params || {}
        }),
      debug: (id, params, opts) =>
        __need("debug_workflow")(
          __merge(opts, { workflow_id: id, params: params || {} })
        ),
      async validate(target) {
        const report = await (typeof target === "string"
          ? __need("validate_workflow")({ workflow_id: target })
          : __need("validate_workflow")({ graph: __graphJson(target) }));
        // A report with errors is a refusal, not data: throw so a caller
        // that forgets to check report.ok cannot carry a broken graph into a
        // paid run.
        if (report && report.ok === false && Array.isArray(report.issues)) {
          // report.ok is decided by the errors alone, so the throw lists the
          // errors alone. Mixing in warnings and the "untyped dynamic slot"
          // info notes buried one real problem under seven non-problems, and
          // a model reading eight bullets rewrites eight things.
          const errors = report.issues.filter(function (i) {
            return i && i.severity === "error" && i.message;
          });
          const other = report.issues.length - errors.length;
          const messages = (errors.length > 0 ? errors : report.issues)
            .map(function (i) {
              return i && i.message;
            })
            .filter(Boolean);
          throw new Error(
            "Graph validation failed:\\n- " +
              messages.slice(0, 8).join("\\n- ") +
              (errors.length > 0 && other > 0
                ? "\\n(" +
                  other +
                  " warning/info issue(s) not blocking; read report.issues" +
                  " for them.)"
                : "")
          );
        }
        return report;
      },
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
          // Thrown synchronously: a caller without await still sees it.
          throw new Error(
            "nodetool.workflows.open: the graph editing tools (ui_*) are " +
            "not in this toolbelt. Author a graph with the sandbox DSL " +
            "package instead, then create() it."
          );
        }
        return openWorkflow(id).catch((e) => {
          const msg = e && e.message ? e.message : String(e);
          // A browser bridge that is gone (window reloaded before the editor
          // panel re-registered) used to surface as this bare sentence, which
          // left one agent retrying the identical call for several turns.
          if (/Frontend tool runtime state is not initialized/i.test(msg)) {
            throw new Error(
              "nodetool.workflows.open: " + msg +
              " The browser bridge answers nothing right now. Ask the user to " +
              "open (or reload) the NodeTool workspace window and retry once " +
              "the editor has loaded; meanwhile get_workflow still reads saved " +
              "graphs and create_workflow saves new ones."
            );
          }
          throw e;
        });
      }
    },

    models: {
      find: (capability, opts) =>
        __need("find_model")(__merge(opts, { capability: capability })),
      /**
       * Resolve ONE model for a capability — the leaderboard's best for that
       * task, ready to pass to nodetool.media.*. To put it in a node's model
       * property, assign the result's "ref" field verbatim (the flat fields use
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
        __need("list_provider_models")(__merge(opts, { provider: provider })),
      /** One language-model roundtrip, with optional image references. */
      generate: (prompt, model, opts) =>
        __need("generate_text")(
          __merge(opts, __merge(__model(model), { prompt: prompt }))
        )
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
      videoFromReferences: (referenceFiles, model, opts) =>
        __need("generate_video_from_references")(
          __merge(
            opts,
            __merge(__model(model), { reference_files: referenceFiles })
          )
        ),
      speak: (text, model, opts) =>
        __need("generate_speech")(
          __merge(opts, __merge(__model(model), { text: text }))
        ),
      /** Music from a prompt — the counterpart of speak(). */
      generateMusic: (prompt, model, opts) =>
        __need("generate_music")(
          __merge(opts, __merge(__model(model), { prompt: prompt }))
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
      /**
       * Read a video with a multimodal chat model (Gemini reads video
       * natively). Returns \`{text}\` — the model's answer to \`prompt\`.
       */
      understandVideo: (video, prompt, model, opts) =>
        __need("understand_video")(
          __merge(
            opts,
            __merge(__model(model), { video: video, prompt: prompt })
          )
        ),
      /** Run ffmpeg on workspace files. \`args\` is argv after the binary name. */
      ffmpeg: (args, opts) => __need("ffmpeg")(__merge(opts, { args: args })),
      /** Read a media file's format and streams with ffprobe. */
      ffprobe: (path, opts) => __need("ffprobe")(__merge(opts, { path: path })),
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
       * host-side; \`opts.provider\` pins one — "default", "serpapi",
       * "dataforseo", "brave", "apify", "openai", "google" (grounded/Gemini).
       */
      search: (query, opts) =>
        __need("web_search")(
          __webArgs(opts, { google: "gemini" }, "query", query)
        ),
      /** News articles. One \`web_search\` with search_type: "news". */
      news: (query, opts) =>
        __need("web_search")(
          __merge(__webArgs(opts, { google: "serpapi" }, "query", query), {
            search_type: "news"
          })
        ),
      /**
       * Image results: title, page link, original image URL, thumbnail URL.
       * Routes across the same backends as \`search\`/\`news\`, minus the two
       * that answer with prose instead of results (openai, google/gemini).
       */
      images: (query, opts) =>
        __need("image_search")(__webArgs(opts, {}, "query", query)),
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
      /** Remember something durably. Readable from every conversation. */
      save: (content, opts) =>
        __need("memory_save")(__merge(opts, { content: content })),
      list: (opts) => __need("memory_list")(__merge(opts)),
      /** Find memories by keyword. Every word must appear. */
      search: (query, opts) =>
        __need("memory_search")(__merge(opts, { query: query })),
      update: (memoryId, fields) =>
        __need("memory_update")(
          __merge(fields, { memory_id: memoryId })
        ),
      remove: (memoryId) =>
        __need("memory_delete")({ memory_id: memoryId })
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
      /** The job row, including the run's outputs once it has settled. */
      get: (id) => __need("get_job")({ job_id: __jobId(id, "get") }),
      logs: (id, opts) =>
        __need("get_job_logs")(__merge(opts, { job_id: __jobId(id, "logs") })),
      /**
       * Poll a background job until it settles, then return the job record.
       * Terminal statuses are completed / failed / cancelled / error (the
       * jobs API's own terminal set). Throws after timeoutMs, naming the job
       * and the last status seen.
       */
      async wait(id, opts) {
        const jobId = __jobId(id, "wait");
        const pollMs = Math.max(1000, (opts && opts.pollMs) || 3000);
        const timeoutMs = (opts && opts.timeoutMs) || 600000;
        const terminal = ["completed", "failed", "cancelled", "error"];
        const deadline = Date.now() + timeoutMs;
        let status = "unknown";
        for (;;) {
          const job = await api.jobs.get(jobId);
          status = (job && (job.status || job.state)) || "unknown";
          if (terminal.indexOf(status) >= 0) return job;
          if (Date.now() >= deadline) {
            throw new Error(
              "nodetool.jobs.wait: job " + jobId + " did not finish within " +
              timeoutMs + "ms (last status: " + status + "). Poll it with " +
              "nodetool.jobs.get(id) or read nodetool.jobs.logs(id)."
            );
          }
          await sleep(pollMs);
        }
      }
    },

    generations: {
      /** The record of every media generation: status, cost, assets. */
      list: (opts) => __need("list_generations")(__merge(opts)),
      get: (id) =>
        __need("get_generation")({ generation_id: __generationId(id, "get") }),
      /**
       * Wait for a generation started with background: true to settle and
       * return its record — cost and asset ids included.
       */
      wait: (id, opts) =>
        __need("await_generation")(
          __merge(opts, { generation_id: __generationId(id, "wait") })
        ),
      cancel: (id) =>
        __need("cancel_generation")({
          generation_id: __generationId(id, "cancel")
        }),
      /** Ask the provider what it billed, by request id, and update the row. */
      reconcile: (id) =>
        __need("reconcile_generation")({
          generation_id: __generationId(id, "reconcile")
        }),
      /**
       * The provider's own record instead of this installation's: what it ran
       * from any machine, at the price it billed. Not every provider keeps one.
       */
      fromProvider: (provider, opts) =>
        __need("list_provider_generations")(__merge(opts, { provider: provider })),
      /** One provider-side generation by the provider's own request id. */
      getFromProvider: (provider, requestId, opts) =>
        __need("get_provider_generation")(
          __merge(opts, { provider: provider, request_id: requestId })
        )
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
      list: (opts) => __need("list_apps")(__merge(opts)),
      get: (id) => __need("get_app")({ application_id: id }),
      /** Create an empty app and get its id back. */
      create: (name, opts) =>
        __need("create_app")(__named(name, opts, "apps.create")),
      /** Apply App Builder steps to a saved app, then save it. */
      edit: (id, steps, opts) =>
        __need("edit_app")(
          __merge(opts, { application_id: id, steps: steps })
        ),
      /** Validate + simulate a saved app. {run: false} is the free check. */
      debug: (id, opts) =>
        __need("debug_app")(__merge(opts, { application_id: id }))
    },

    games: {
      create: (name, opts) =>
        __need("create_native_game")(__named(name, opts, "games.create")),
      get: (id, opts) => __need("get_native_game")(__merge(opts, { game_id: id })),
      edit: (id, ops, opts) => __need("edit_native_game")(__merge(opts, { game_id: id, ops })),
      setDocument: (id, document, opts) =>
        __need("edit_native_game")(__merge(opts, { game_id: id, ops: [{ op: "set_document", document }] })),
      publish: (id, opts) => __need("publish_native_game")(__merge(opts, { game_id: id })),
      installAsset: (id, slot, binding, opts) =>
        __need("install_native_game_asset")(__merge(opts, { game_id: id, slot, binding })),
      playtest: (id, opts) => __need("playtest_native_game")(__merge(opts, { game_id: id })),
      capture: (id, opts) => __need("capture_native_game_frame")(__merge(opts, { game_id: id })),
      generateAsset: (id, slot, kind, prompt, opts) =>
        __need("generate_game_asset")(__merge(opts, { game_id: id, slot, kind, prompt })),
      build: (id, opts) => __need("build_native_game")(__merge(opts, { game_id: id })),
      listExamples: (opts) => __need("list_example_games")(__merge(opts)),
      getExample: (slug) => __need("get_example_game")({ slug }),
      installExample: (slug, opts) => __need("install_example_game")(__merge(opts, { slug })),
      autoplay: (id, opts) => __need("autoplay_native_game")(__merge(opts, { game_id: id }))
    },

    timelines: {
      list: (opts) => __need("list_timelines")(__merge(opts)),
      examples: {
        list: (opts) => __need("list_example_timelines")(__merge(opts)),
        get: (slug, opts) =>
          __need("get_example_timeline")(__merge(opts, { slug: slug }))
      },
      create: (name, opts) =>
        __need("create_timeline")(__named(name, opts, "timelines.create")),
      get: (id) => __need("get_timeline")({ timeline_id: id }),
      versions: (id, opts) =>
        __need("list_timeline_versions")(__merge(opts, { timeline_id: id })),
      getVersion: (id, version) =>
        __need("get_timeline_version")({ timeline_id: id, version: version }),
      /** Save the current state as a version. Options: {name}. */
      snapshot: (id, opts) =>
        __need("create_timeline_version")(__merge(opts, { timeline_id: id })),
      /** Alias of snapshot(), named after the create_timeline_version tool. */
      createVersion: (id, opts) =>
        __need("create_timeline_version")(__merge(opts, { timeline_id: id })),
      restore: (id, version) =>
        __need("restore_timeline_version")({
          timeline_id: id,
          version: version
        }),
      deleteVersion: (id, version) =>
        __need("delete_timeline_version")({
          timeline_id: id,
          version: version
        }),
      /** Options: {fps, width, height, tier, normalize}. normalize:true preflights authoring defaults for an inline document. */
      validate: (target, opts) =>
        typeof target === "string"
          ? __need("validate_timeline")(__merge(opts, { timeline_id: target }))
          : __need("validate_timeline")(__merge(opts, { document: target })),
      /**
       * Composited frames at chosen timecodes — the finished picture, with
       * every track layered, animations sampled mid-flight and transitions
       * part way through. Takes an id or an inline document, like validate().
       * Options: {times_ms, count, width}.
       */
      preview: (target, opts) =>
        typeof target === "string"
          ? __need("preview_timeline_frame")(
              __merge(opts, { timeline_id: target })
            )
          : __need("preview_timeline_frame")(
              __merge(opts, { document: target })
            ),
      /**
       * Per-frame pixel difference between two timelines, plus a side-by-side
       * sheet. Each side is an id, {timeline_id, version} or a document.
       * Options: {times_ms, range, width}.
       */
      compare: (a, b, opts) =>
        __need("compare_timeline_frames")(__merge(opts, { a: a, b: b })),
      /** Apply document edits to a saved sequence, server-side. */
      edit: (id, ops) => __need("edit_timeline")({ timeline_id: id, ops: ops }),
      /**
       * Write a whole document at once. The document replaces the stored one,
       * so send back what get() returned, changed. Validated before anything
       * is written and snapshotted first, so a bad document is refused and a
       * good one is undoable. Options: {fps, width, height,
       * expected_updated_at, snapshot_name}.
       *
       * Bookkeeping you leave out is filled in rather than refused: a track's
       * index (its position in the array), visible: true and locked: false; a
       * clip's sourceType (generated when it names a prompt, workflow or
       * binding, else imported), status "generated", locked: false and
       * versions: []; animation ids (anim_1, anim_2, …), clip and track
       * effect ids (effect_1, effect_2, …) and enabled: true; missing clip
       * tracks inferred from mediaType; and markers: [].
       * Anything you do send is kept as sent. fps/width/height on the document
       * itself are read as the sequence's settings when the options omit them.
       */
      setDocument: (id, document, opts) =>
        __need("set_timeline_document")(
          __merge(opts, { timeline_id: id, document: document })
        ),
      /**
       * Render the finished cut as a job. Returns {job_id} immediately;
       * {wait: true} blocks and returns the rendered asset. Options:
       * {format, alpha, video_codec, bitrate, motion_blur_samples,
       * shutter_angle, preview_scale, include_audio, wait, timeout_ms}.
       */
      render: (id, opts) =>
        __need("render_timeline")(__merge(opts, { timeline_id: id })),
      /**
       * Reusable templates — a group of clips with named parameters. The ones
       * NodeTool ships and the ones this user saved, both listed by list().
       * Insert one with edit(id, [{op: "insert_composition", composition_id,
       * startMs, params}]).
       */
      compositions: {
        /** Options: {source: "shipped" | "user", query, limit}. */
        list: (opts) => __need("list_compositions")(__merge(opts)),
        get: (id) => __need("get_composition")({ composition_id: id }),
        /**
         * Save a group on a timeline as a template. params names what varies:
         * {"<name>": {type, default, path}}.
         */
        save: (timelineId, groupTarget, name, params, opts) =>
          __need("save_composition")(
            __merge(opts, {
              timeline_id: timelineId,
              group_target: groupTarget,
              name: name,
              params: params
            })
          ),
        remove: (id) => __need("delete_composition")({ composition_id: id })
      }
    },

    sketches: {
      list: (opts) => __need("list_sketches")(__merge(opts)),
      /** Create a blank sketch. Pass {width, height} for the canvas size. */
      create: (name, opts) =>
        __need("create_sketch")(__named(name, opts, "sketches.create")),
      get: (id) => __need("get_sketch")({ image_document_id: id }),
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
      deleteVersion: (id, version) =>
        __need("delete_sketch_version")({
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
      /** Create an empty script. Pass {project_id} to place it. */
      create: (name, opts) =>
        __need("create_script")(__named(name, opts, "scripts.create")),
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
      /** Create a blank storyboard. Pass {brief, style, aspect_ratio} for board settings. */
      create: (name, opts) =>
        __need("create_storyboard")(__named(name, opts, "storyboards.create")),
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

  /**
   * Guest globals a caller reaches for under \`nodetool.\` — the namespaces that
   * live at the top level of the sandbox rather than on the object model. Each
   * value is the one sentence that sends the caller to the right place.
   */
  const __GUEST_GLOBALS = {
    image: "Probing and editing pixels is \`image.*\`; generating a picture is \`nodetool.media.generateImage\`.",
    audio: "Sample-level work is \`audio.*\`; generating speech or music is \`nodetool.media.generateSpeech\`/\`generateMusic\`.",
    video: "Frame and container work is \`video.*\`; generating a clip is \`nodetool.media.generateVideo\`, and probing or encoding a file with a host binary is \`nodetool.media.ffprobe\`/\`ffmpeg\`.",
    canvas: "Drawing is \`canvas.*\`.",
    media: "The bare \`media.*\` global holds byte helpers; the tools are \`nodetool.media.*\`.",
    format: "Text and table formatting is \`format.*\`.",
    workspace: "Run files are \`workspace.*\`; the library is \`nodetool.assets.*\`.",
    fetch: "The network is the \`fetch\` global, or \`nodetool.web.fetch\`."
  };

  /**
   * What a member that does not exist answers with: callable, and a namespace
   * all the way down, so \`nodetool.script.list()\` reports the typo in
   * \`script\` rather than bottoming out one hop later as
   * \`TypeError: not a function\` — the message the whole guard exists to
   * replace.
   */
  const __missing = (message) =>
    new Proxy(function () {}, {
      apply() {
        throw new Error(message);
      },
      get(target, prop) {
        if (typeof prop !== "string" || prop === "then") return target[prop];
        return __missing(message);
      }
    });

  /**
   * The nearest member name to one that does not exist, comparing on letters
   * and digits alone: \`find_model\` finds \`find\`, \`assemble_timeline\` finds
   * \`assembleTimeline\`, \`create_script\` finds \`create\`.
   */
  const __nearest = (prop, names) => {
    const flatten = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const want = flatten(prop);
    let best = null;
    for (const name of names) {
      const have = flatten(name);
      if (have === want) return name;
      if (have.length === 0) continue;
      const near = want.indexOf(have) === 0 || have.indexOf(want) === 0;
      if (near && (best === null || have.length > flatten(best).length)) {
        best = name;
      }
    }
    return best;
  };

  /**
   * Every namespace is guarded, so a member that does not exist answers with
   * its own name instead of QuickJS's \`TypeError: not a function\`.
   *
   * The name a capability has on the belt is not the name it has here — the
   * object model curates: \`find_model\` is \`nodetool.models.find\`,
   * \`create_script\` is \`nodetool.scripts.create\`. A caller reaching for the
   * belt spelling got a message that named neither the call it made nor the
   * one it meant, and a bare \`TypeError\` reads like the sandbox is broken
   * rather than like a typo: one chat took it as "models are unavailable here"
   * and abandoned the namespace. An unknown member answers with a thrower
   * rather than \`undefined\` — the shape \`tools.<name>\` already uses — so the
   * report lands at the call, where the mistake is, and reads the same whether
   * the missing half is the method or the namespace.
   */
  const __guard = (path, obj) =>
    new Proxy(obj, {
      get(target, prop) {
        // Symbols, everything that really is there, and the handful of names
        // the language itself reaches for pass straight through: \`then\` so
        // awaiting a namespace cannot mistake it for a thenable, \`toJSON\` and
        // \`inspect\` so logging one still prints it instead of throwing.
        if (
          typeof prop !== "string" ||
          prop === "then" ||
          prop === "toJSON" ||
          prop === "inspect" ||
          prop in target
        ) {
          return target[prop];
        }
        const names = Object.keys(target).sort();
        const nearest = __nearest(prop, names);
        // A name that is a *global* here reads as a missing namespace: the
        // pixel and sample ops are \`image.*\`/\`audio.*\`/\`video.*\`, not
        // \`nodetool.video.*\`, and a chat that took the miss at face value
        // gave up on the operation instead of dropping the prefix.
        const global = path === "nodetool" ? __GUEST_GLOBALS[prop] : undefined;
        return __missing(
          path + "." + prop + " does not exist" +
            (global
              ? ". \`" + prop + "\` is a global in this sandbox — call \`" +
                prop + ".*\` with no \`nodetool.\` prefix. " + global
              : nearest
                ? ". Did you mean " + path + "." + nearest + "?"
                : ".") +
            " " + path + " has: " + names.join(", ") + "." +
            (path === "nodetool"
              ? ""
              : ' nodetool.searchTools("' + prop + '") finds the tool ' +
                "behind a name if it is one.")
        );
      }
    });

  for (const key of Object.keys(api)) {
    const value = api[key];
    if (value && typeof value === "object") {
      api[key] = __guard("nodetool." + key, value);
    }
  }
  return __guard("nodetool", api);
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
  /**
   * The shipped skill with every option, return shape and example for this
   * namespace. The prompt names it; the detail lives there, so the prompt
   * pays for a signature list rather than a reference manual.
   */
  skill: string;
  /** Rendered doc lines for the prompt. */
  doc: string;
}

const NAMESPACE_DOCS: PromptEntry[] = [
  {
    namespace: "workflows",
    skill: "api-workflows",
    doc: `- \`nodetool.workflows\` — saved graphs and their runs: \`list()\` (→
  \`{workflows}\`, an envelope), \`get(id)\`, \`create(name, graph)\`,
  \`validate(idOrGraph)\` (throws on errors), \`run(id, params)\`,
  \`start(id, params)\` (→ job receipt), \`debug(id, params)\`,
  \`resolve(sessionId, escalationId, action)\`, \`example("<package>/<name>")\`,
  \`versions\`, \`getVersion\`, \`snapshot\`, \`restore\`, \`deleteVersion\`,
  \`open(id?)\`. Saving a graph does not run it.`
  },
  {
    namespace: "settings",
    skill: "api-settings",
    doc: `- \`nodetool.settings\` — \`list({group})\`, \`get(key)\`, \`set(key, value)\`,
  \`secrets()\` (names only), \`requestSecret(key, {reason, help_url})\`. A secret
  is never set from code: \`requestSecret\` opens a dialog for the user.`
  },
  {
    namespace: "nodes",
    skill: "api-workflows",
    doc: `- \`nodetool.nodes\` — \`search(query)\` (→ \`{total, results}\`, the type is on
  \`type\`), \`info(type)\`, \`list({namespace})\`, \`run(type, inputs)\` (one node,
  no graph). NEVER guess a node type: search, then \`info\`.`
  },
  {
    namespace: "agents",
    skill: "api-agents",
    doc: `- \`nodetool.agents\` — \`run(prompt)\`, \`start(prompt)\` (→ \`{subtask_id}\`),
  \`wait({ids})\`. A sub-agent has your tools and a FRESH context, so the
  prompt must be self-contained.`
  },
  {
    namespace: "models",
    skill: "api-models",
    doc: `- \`nodetool.models\` — \`pick(capability, {query})\` (→ one model),
  \`find(capability)\` (→ \`{results}\`), \`list()\`, \`forProvider(provider)\`,
  \`generate(prompt, model)\`. Never guess a model id. A node's model property
  takes the result's \`ref\` verbatim.`
  },
  {
    namespace: "media",
    skill: "api-media",
    doc: `- \`nodetool.media\` — one generation with a picked model, saved as an asset:
  \`generateImage(prompt, model)\`, \`editImage(inputFile, prompt, model)\`,
  \`generateVideo(prompt, model)\`, \`animateImage(inputFile, model)\`,
  \`videoFromReferences(files, model)\`, \`speak(text, model)\`,
  \`generateMusic(prompt, model)\`, \`transcribe(inputFile, model)\`,
  \`embed(text, model)\`; judges \`critique(\`, \`compare(\`, \`scoreAdherence(\`,
  \`understandVideo(\`; \`ffmpeg(args)\`, \`ffprobe(path)\`, \`downloadVideo(url)\`;
  \`toImage/toAudio/toVideo(handle)\` saves a handle.
  Hold each result in a local variable and feed it straight into the next
  call; record the uris a later action or turn will need with
  \`nodetool.memory.save\` — never re-run generation for something already saved.`
  },
  {
    namespace: "documents",
    skill: "api-assets",
    doc: `- \`nodetool.documents\` — workspace file conversion: \`convert(inputFile,
  outputFile)\`, \`extractText(pdfPath)\`, \`extractTables(pdfPath, outFile)\`,
  \`markdownToPdf(inputFile, outputFile)\`, \`pdfToMarkdown(inputFile, outputFile)\`.`
  },
  {
    namespace: "web",
    skill: "api-web",
    doc: `- \`nodetool.web\` — \`search(query)\`, \`news(query)\`, \`images(query)\`,
  \`browse(url)\` (readable text), \`fetch(url, {method, headers, body})\`,
  \`download(url, outputFile)\`, \`screenshot(url, outputFile)\`.`
  },
  {
    namespace: "memory",
    skill: "api-memory",
    doc: `- \`nodetool.memory\` — durable notes across conversations: \`save(content,
  {title, kind, resources})\`, \`search(query)\`, \`list()\`, \`update(id, fields)\`,
  \`remove(id)\`. Put what you produce in \`resources\`.`
  },
  {
    namespace: "threads",
    skill: "api-memory",
    doc: `- \`nodetool.threads\` — chat history, read-only: \`list()\`, \`get(threadId)\`,
  \`last(threadId)\`, \`message(messageId)\`.`
  },
  {
    namespace: "shared",
    skill: "api-memory",
    doc: `- \`nodetool.shared\` — the scratchpad of THIS run: \`list()\` (metadata
  only), \`read(keys)\`, \`publish(key, value)\`. Earlier step and task results
  land here.`
  },
  {
    namespace: "email",
    skill: "api-web",
    doc: `- \`nodetool.email\` — \`search({subject, text, since_hours_ago})\`,
  \`archive(messageIds)\`, \`label(messageId, label)\`.`
  },
  {
    namespace: "assets",
    skill: "api-assets",
    doc: `- \`nodetool.assets\` — the library: \`list()\`, \`search(query)\`,
  \`images()\` (handles for \`view_image\`), \`get(id)\`, \`read(nameOrUri)\`,
  \`save(name, {content | content_base64 | source})\`. Keep a file another tool
  stored by passing it as \`source\`, never by reading it to base64.`
  },
  {
    namespace: "jobs",
    skill: "api-workflows",
    doc: `- \`nodetool.jobs\` — \`list()\`, \`get(id)\`, \`logs(id)\`,
  \`wait(idOrReceipt, {timeoutMs})\` (polls until the job settles).`
  },
  {
    namespace: "generations",
    skill: "api-media",
    doc: `- \`nodetool.generations\` — status and cost of every media generation:
  \`list()\`, \`get(id)\`, \`wait(id)\` (for \`background: true\`), \`cancel(id)\`,
  \`reconcile(id)\`, \`fromProvider(provider)\`, \`getFromProvider(provider, requestId)\`.`
  },
  {
    namespace: "collections",
    skill: "api-collections",
    doc: `- \`nodetool.collections\` — vector search: \`list()\`, \`query(collection,
  text)\`, \`index(text, sourceId)\`, \`indexBatch(chunks)\`, \`search(text)\`,
  \`hybridSearch(text)\`.`
  },
  {
    namespace: "apps",
    skill: "api-apps",
    doc: `- \`nodetool.apps\` — mini apps: \`list()\`, \`get(id)\`, \`create(name)\`,
  \`edit(id, steps)\` (\`edit(id, [])\` lists the App Builder tools),
  \`debug(id, {run: false})\` (the free wiring check).`
  },
  {
    namespace: "games",
    skill: "api-games",
    doc: `- \`nodetool.games\` — built-in games: \`create(name, {project_id})\`,
  \`get(id)\`, \`edit(id, ops)\`, \`setDocument(id, document)\`,
  \`generateAsset(id, slot, kind, prompt)\`, \`installAsset\`, \`playtest(id)\`,
  \`autoplay(id, {win})\`, \`capture(id)\`, \`publish(id)\`, \`build(id)\`,
  \`listExamples()\`, \`getExample(slug)\`, \`installExample(slug)\`.`
  },
  {
    namespace: "timelines",
    skill: "api-timelines",
    doc: `- \`nodetool.timelines\` — \`list()\` (→ \`{timelines}\`), \`create(name, {fps,
  width, height})\`, \`get(id)\`, \`edit(id, ops)\`, \`setDocument(id, document)\`,
  \`validate(idOrDocument, {tier: "showcase"})\`, \`preview(idOrDocument,
  {times_ms, range, sheet})\`, \`compare(a, b)\`, \`render(id)\`, versions,
  \`examples.list/get\`, \`compositions.*\`. Build a motion-graphics piece in
  code with \`@nodetool-ai/sandbox-timeline\`, and look at previewed frames
  before you call it done.`
  },
  {
    namespace: "sketches",
    skill: "api-sketches",
    doc: `- \`nodetool.sketches\` — layered image documents: \`list()\`,
  \`create(name, {width, height})\`, \`get(id)\`, \`edit(id, ops)\`,
  \`validate(idOrDocument)\`, versions. Layers only; pixels stay with an editor
  or a workflow run.`
  },
  {
    namespace: "scripts",
    skill: "api-scripts",
    doc: `- \`nodetool.scripts\` — voice scripts: \`list()\`, \`create(name)\`,
  \`get(id)\`, \`edit(id, ops)\`, \`voice(id)\`, \`assembleTimeline(id)\`.`
  },
  {
    namespace: "storyboards",
    skill: "api-storyboards",
    doc: `- \`nodetool.storyboards\` — shot lists: \`list()\`, \`create(name, {brief,
  style, aspect_ratio})\`, \`get(id)\`, \`edit(id, ops)\`, \`renderStills(id)\`
  (cheap), \`renderClips(id)\` (expensive), \`reviseClip(id, target,
  instruction)\`, \`assembleTimeline(id)\`.`
  }
];

const BATCH_EXAMPLE = `Batching turns one workflow into a dynamic pipeline — loops, joins, and
per-item parameters live in your code:

\`\`\`js
const rows = JSON.parse(await workspace.read("products.json"));
const runs = await nodetool.batch(rows, (row) =>
  nodetool.workflows.run(wfId, { image_url: row.image_url, title: row.title }),
  { concurrency: 3 });
const failed = runs.filter((r) => !r.ok);
if (failed.length) {
  await nodetool.memory.save("failed rows: " + failed.map((r) => r.index).join(","), { title: "Batch failures" });
}
return { ok: runs.filter((r) => r.ok).length, failed: failed.length };
\`\`\`

\`nodetool.batch(items, fn, {concurrency, stopOnError})\` never throws — each
entry settles as \`{ok, index, item, value | error}\`. A handful of items is one
\`batch\` call in one action; only lists big enough to threaten the sandbox
limits get chunked across actions, persisting partial progress with
\`nodetool.memory.save\`.`;

const MEDIA_EXAMPLE = `Pick a model, then generate — batching included. Every result
is already a saved asset; return the uris and record the ones you will need
after this action:

\`\`\`js
const model = await nodetool.models.pick("text_to_image");
const shots = ["a red fox in snow", "a fox by a river"];
const images = await nodetool.batch(shots, (prompt) =>
  nodetool.media.generateImage(prompt, model), { concurrency: 2 });
const uris = images.map((r) => (r.ok ? r.value.asset_uri : null)).filter(Boolean);
await nodetool.memory.save(uris.join("\\n"), { title: "Fox stills" });
return uris;
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
  /**
   * Whether this session can call nodes directly with
   * `@nodetool-ai/sandbox-flow` — the pack is installed and on the
   * allowlist. The caller decides it (`withFlowPackage`).
   */
  nativeFlow?: boolean;
}

/**
 * The rule for choosing between the three ways a turn makes node work happen.
 * Rendered only for the surfaces this session actually has, so it never sends
 * the model at a pack that is not installed.
 *
 * It exists because the surfaces answer different questions and a model that
 * knows all three still picks by habit: a chat turn asked to "run a pipeline
 * that generates an image and removes its background" authored a graph, saved
 * it, never ran it, and then — asked to do it "without a graph" — bent
 * `media.editImage` into a background remover instead of calling the
 * `RemoveBackground` node it had already found.
 */
function surfaceChoiceSection(
  options: NodetoolApiPromptOptions,
  names: ReadonlySet<string>
): string {
  if (!options.nativeFlow && !options.graphDsl) return "";
  const bullets: string[] = [];
  if (names.has("generate_image")) {
    bullets.push(`- \`nodetool.media.*\` — ONE generation with a picked model: an image, a
  video, speech, a transcript. The short path when a verb there does exactly
  what was asked. It has no verb for most node work, and stretching one to
  cover a node — an edit prompt in place of a background remover, an
  upscaler, a converter — produces something other than the node the user
  meant.`);
  }
  if (options.nativeFlow) {
    bullets.push(`- **Native flow** (\`${FLOW_PACKAGE}\`) — the user wants the RESULT:
  "run", "generate", "then", "for each". Any node in the registry, several in
  a row, in this action. Nothing is saved and nothing opens in the editor.`);
  }
  if (options.graphDsl) {
    bullets.push(`- **Graph DSL** (\`${GRAPH_DSL_PACKAGE}\`) — the user wants the WORKFLOW:
  something saved, opened in the editor, re-run later, or handed to someone
  else. Authoring it does not run it — \`nodetool.workflows.run(id, params)\`
  does.`);
  }
  const closer = options.nativeFlow
    ? `

When the ask is to do the work and the user never mentioned a workflow, run
the nodes and report what came out. Reaching for a graph there leaves the
user with an artifact they did not ask for and the work still undone.`
    : "";
  return `# Which surface runs the work

Pick by what the user asked for, not by what the last turn used.

${bullets.join("\n")}${closer}`;
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
driven through \`nodetool.*\`, not through the raw imported calls. The backing
tools are deliberately absent from the tool catalog above; this object model
is their one documented surface. \`nodetool.capabilities()\` reports what is
available. A method whose backing tool is missing throws and names the tool.`,
    `The same capabilities are also importable, one module per namespace:
\`import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows"\`, or
\`import workflows from "@nodetool-ai/sandbox-nodetool/workflows"\` for the whole
namespace. Each export takes the one arguments object its tool takes. This is
the same gated implementation \`nodetool.*\` calls — \`nodetool.*\` stays
available, and the two cannot disagree. A module this session does not mount
fails the action by name, before any code runs.`
  ];
  // A skill is only worth naming when this belt can load it.
  const skills = names.has("load_skill");
  if (skills) {
    sections.push(`Each line below is a summary. Its skill (\`load_skill\`) holds every
option, return shape and example: load it before the first call into that
namespace.`);
  }
  sections.push(
    active
      .map((entry) =>
        skills ? `${entry.doc} Skill: \`${entry.skill}\`.` : entry.doc
      )
      .join("\n")
  );
  const choice = surfaceChoiceSection(options, names);
  if (choice) sections.push(choice);
  if (options.graphDsl) sections.push(GRAPH_DSL_PROMPT_SECTION);
  if (options.nativeFlow) sections.push(FLOW_PROMPT_SECTION);
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
