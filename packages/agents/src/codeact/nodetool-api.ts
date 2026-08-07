/**
 * The `nodetool` object model — the agent-facing JS API for the CodeAct
 * sandbox. Where `tools.<name>()` is the raw RPC surface, `nodetool.*` is the
 * platform as objects: workflows, an ad-hoc graph builder, models, assets,
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
  graph: ["create_workflow", "validate_workflow", "run_workflow"],
  nodes: ["search_nodes", "get_node_info", "list_nodes", "run_node"],
  agents: ["run_subtask"],
  models: ["find_model", "list_models", "list_provider_models"],
  providers: ["list_models", "list_provider_models"],
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
    "score_image_adherence"
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
    "openai_web_search",
    "google_grounded_search",
    "google_images",
    "google_news",
    "dataforseo_search",
    "dataforseo_news",
    "dataforseo_images",
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
  apps: ["build_app", "debug_app"],
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
        "method is unavailable here. searchTools() lists what is."
      );
    }
    return fn;
  };
  const __merge = (a, b) => Object.assign({}, a || {}, b || {});

  /**
   * \`taste_profile\` is a prompt block (a string). Accept the full record
   * \`profileDetails()\` returns too, so passing either shape works.
   */
  const __taste = (opts) => {
    const merged = __merge(opts);
    const profile = merged.taste_profile;
    if (profile && typeof profile === "object" &&
        typeof profile.profile === "string") {
      merged.taste_profile = profile.profile;
    }
    return merged;
  };

  /** Accept a GraphBuilder, a bare {nodes, edges}, or a workflow record. */
  const __graphJson = (source) => {
    if (source && typeof source.toJSON === "function") return source.toJSON();
    if (source && Array.isArray(source.nodes)) {
      return { nodes: source.nodes, edges: source.edges || [] };
    }
    if (source && source.graph && Array.isArray(source.graph.nodes)) {
      return { nodes: source.graph.nodes, edges: source.graph.edges || [] };
    }
    throw new Error(
      "nodetool: expected a graph builder, a {nodes, edges} graph, or a " +
      "workflow record with a .graph"
    );
  };

  /**
   * A backend that is registered but unusable — no key, no configuration.
   * The belt carries the tool, so \`__has\` says yes and only the call finds
   * out; that is a reason to try the next backend, not to fail the search.
   */
  const __unconfigured = (message) =>
    /api[_ -]?key|not configured|unconfigured|no credential|credentials|missing|unauthorized|forbidden|401|403/i
      .test(String(message || ""));

  /**
   * Route a web query to one of several interchangeable backing tools.
   * \`choices\` is [providerName, toolName, queryField][] in preference order.
   * \`opts.provider\` pins one — it is then the only backend tried, and its
   * failure is the call's failure. Otherwise backends are tried in order and
   * an unconfigured one falls through to the next; exhausting them all throws
   * with every error.
   */
  const __pickWeb = async (method, opts, choices, query) => {
    const rest = __merge(opts);
    const wanted = rest.provider;
    delete rest.provider;
    const text = String(query === undefined || query === null ? "" : query);
    const failures = [];
    for (const choice of choices) {
      if (wanted !== undefined && wanted !== choice[0]) continue;
      if (!__has(choice[1])) continue;
      const args = __merge(rest);
      args[choice[2]] = text;
      try {
        return await tools[choice[1]](args);
      } catch (e) {
        const message = e && e.message ? e.message : String(e);
        if (wanted !== undefined) throw e;
        if (!__unconfigured(message)) throw e;
        failures.push(choice[0] + " (" + choice[1] + "): " + message);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        "nodetool.web." + method + ": every available backend is " +
        "unconfigured — " + failures.join("; ")
      );
    }
    throw new Error(
      "nodetool.web." + method + ": no backing tool on this belt" +
      (wanted !== undefined ? ' for provider "' + wanted + '"' : "") +
      " (tried " + choices.map((c) => c[1]).join(", ") + ")."
    );
  };

  const __nodeId = (ref) =>
    typeof ref === "string" ? ref : ref && ref.id ? ref.id : String(ref);

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

  function graphBuilder(base) {
    const nodes = [];
    const edges = [];
    const byId = {};
    let seq = 0;

    const uniqueId = (hint) => {
      const stem = String(hint || "node")
        .split(".")
        .pop()
        .replace(/[^A-Za-z0-9_]/g, "_")
        .toLowerCase();
      let id = stem + "_" + (++seq);
      while (byId[id]) id = stem + "_" + (++seq);
      return id;
    };

    const addEdge = (source, sourceHandle, target, targetHandle) => {
      const edge = {
        id: "e" + (edges.length + 1) + "_" + source + "_" + target,
        source: source,
        sourceHandle: sourceHandle || "output",
        target: target,
        targetHandle: targetHandle
      };
      edges.push(edge);
      return edge;
    };

    const wireProps = (targetId, props) => {
      const plain = {};
      for (const key of Object.keys(props || {})) {
        const value = props[key];
        if (value && typeof value === "object" && value.__ntOutput === true) {
          addEdge(value.node, value.slot, targetId, key);
        } else {
          plain[key] = value;
        }
      }
      return plain;
    };

    const makeRef = (raw) => {
      const ref = {
        id: raw.id,
        type: raw.type,
        properties: raw.properties,
        output: (slot) => ({
          __ntOutput: true,
          node: raw.id,
          slot: slot || "output"
        }),
        set(props) {
          Object.assign(raw.properties, wireProps(raw.id, props));
          return ref;
        }
      };
      byId[raw.id] = ref;
      return ref;
    };

    const g = {
      node(type, properties, opts) {
        const id = (opts && opts.id) || uniqueId(type);
        if (byId[id]) throw new Error('Duplicate node id "' + id + '"');
        const raw = { id: id, type: type, properties: {} };
        nodes.push(raw);
        const ref = makeRef(raw);
        Object.assign(raw.properties, wireProps(id, properties));
        return ref;
      },
      connect(source, sourceHandle, target, targetHandle) {
        return addEdge(
          __nodeId(source),
          sourceHandle,
          __nodeId(target),
          targetHandle
        );
      },
      get(id) {
        const found = byId[id];
        if (!found) {
          throw new Error(
            "Node not found: " + id + ". Known: " + Object.keys(byId).join(", ")
          );
        }
        return found;
      },
      nodes: nodes,
      edges: edges,
      /**
       * Copy another graph (builder, {nodes, edges}, or workflow record) into
       * this one. Ids that collide are remapped with a prefix; returns
       * { idMap, refs } where refs is keyed by the SOURCE id, so wiring into
       * copied nodes never needs the remapped name.
       */
      copyFrom(source, opts) {
        const src = __graphJson(source);
        const prefix = (opts && opts.prefix) || "";
        const idMap = {};
        const refs = {};
        for (const n of src.nodes) {
          const props = __merge(
            n.properties ||
              (n.data && n.data.properties ? n.data.properties : n.data)
          );
          let id = prefix + n.id;
          if (byId[id]) id = uniqueId(prefix + n.id);
          idMap[n.id] = id;
          const raw = { id: id, type: n.type, properties: props };
          nodes.push(raw);
          refs[n.id] = makeRef(raw);
        }
        for (const e of src.edges || []) {
          if (idMap[e.source] === undefined || idMap[e.target] === undefined) {
            continue;
          }
          addEdge(
            idMap[e.source],
            e.sourceHandle || e.source_output,
            idMap[e.target],
            e.targetHandle || e.target_input
          );
        }
        return { idMap: idMap, refs: refs };
      },
      toJSON() {
        return {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            properties: __merge(n.properties)
          })),
          edges: edges.map((e) => __merge(e))
        };
      },
      validate() {
        return __need("validate_workflow")({ graph: g.toJSON() });
      },
      save(name, opts) {
        return __need("create_workflow")(
          __merge(opts, { name: name, graph: g.toJSON() })
        );
      },
      /**
       * Run this graph ad hoc: saves it as a workflow (tagged so it is easy
       * to find and clean up), then runs it. Returns { workflow, result }.
       * Pass { name } to keep it as a deliberate, named workflow instead.
       */
      async run(params, opts) {
        const name =
          (opts && opts.name) || "Ad-hoc graph " + new Date().toISOString();
        const tags = (opts && opts.tags) || ["codeact-adhoc"];
        const workflow = await g.save(name, { tags: tags });
        if (!workflow || !workflow.id) {
          throw new Error("Ad-hoc run: saving the graph returned no id");
        }
        const result = await __need("run_workflow")(
          __merge(opts && opts.interactive ? { interactive: true } : {}, {
            workflow_id: workflow.id,
            params: params || {}
          })
        );
        return { workflow: workflow, result: result };
      }
    };

    if (base) g.copyFrom(base, {});
    return g;
  }

  const api = {
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

    graph: graphBuilder,

    nodes: {
      /**
       * Search the node catalog. \`query\` takes a string or an array of
       * strings; \`opts\` passes n_results / input_type / output_type through.
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
      },
      /**
       * Fan out sub-agents over prompts (strings or {prompt, description})
       * with nodetool.batch semantics: bounded concurrency, one settled
       * {ok, value | error} entry per prompt.
       */
      fanout(prompts, opts) {
        return api.batch(
          Array.from(prompts),
          (p) =>
            typeof p === "string"
              ? api.agents.run(p, opts)
              : api.agents.run(p.prompt, __merge(opts, { description: p.description })),
          opts
        );
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
      /** Shipped example workflows — id, name, description, tags only. */
      examples: (opts) =>
        __need("list_workflows")(__merge(opts, { workflow_type: "example" })),
      /**
       * One example workflow, graph included — ready for
       * nodetool.graph().copyFrom(...). Name is "<package>/<example>", or
       * pass the package separately as {package}.
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
            "nodetool.workflows.examples() lists them."
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
            "not in this toolbelt. Build with nodetool.graph() instead."
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
       * pass to nodetool.media.* or into node properties. Throws when no
       * configured provider offers the capability.
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
        return results[0];
      },
      list: (opts) => __need("list_models")(__merge(opts))
    },

    providers: {
      /** Configured providers, derived from the model catalog: one entry per
       * provider with its model count and the model types it serves. */
      async list() {
        const res = await __need("list_models")({ limit: 1000 });
        const byProvider = {};
        for (const m of (res && res.results) || []) {
          const entry =
            byProvider[m.provider] ||
            (byProvider[m.provider] = {
              provider: m.provider,
              models: 0,
              types: []
            });
          entry.models++;
          if (m.type && entry.types.indexOf(m.type) < 0) {
            entry.types.push(m.type);
          }
        }
        const list = Object.keys(byProvider).map((key) => byProvider[key]);
        if (list.length === 0 && res && res.note) {
          return { providers: [], note: res.note };
        }
        return list;
      },
      models: (provider, opts) =>
        __has("list_provider_models")
          ? tools.list_provider_models(__merge(opts, { provider: provider }))
          : __need("list_models")(__merge(opts, { provider: provider }))
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
            __taste(opts),
            __merge(__model(model), { image: image, brief: brief })
          )
        ),
      /** Pick the best of 2-8 candidates by pairwise knockout. */
      compare: (images, brief, model, opts) =>
        __need("compare_images")(
          __merge(
            __taste(opts),
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
        )
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
       * Search the web. Providers in preference order: "default"
       * (web_search), "openai", "google", "dataforseo". Naming one that is
       * not on the belt throws and says so.
       */
      search: (query, opts) =>
        __pickWeb(
          "search",
          opts,
          [
            ["default", "web_search", "query"],
            ["openai", "openai_web_search", "query"],
            ["google", "google_grounded_search", "query"],
            ["dataforseo", "dataforseo_search", "keyword"]
          ],
          query
        ),
      news: (query, opts) =>
        __pickWeb(
          "news",
          opts,
          [
            ["google", "google_news", "keyword"],
            ["dataforseo", "dataforseo_news", "keyword"]
          ],
          query
        ),
      images: (query, opts) =>
        __pickWeb(
          "images",
          opts,
          [
            ["google", "google_images", "keyword"],
            ["dataforseo", "dataforseo_images", "keyword"]
          ],
          query
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
       * is what generation prompts and \`taste_profile\` take. Use
       * \`profileDetails()\` for the individual preference records.
       */
      profile: (opts) =>
        __need("get_style_profile")(__merge(opts)).then((r) =>
          r && typeof r === "object" && typeof r.profile === "string"
            ? r.profile
            : r
        ),
      /** The same profile plus the preference items behind it. */
      profileDetails: (opts) => __need("get_style_profile")(__merge(opts)),
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
        __has("asset_search")
          ? tools.asset_search(__merge(opts, { query: query }))
          : __need("list_assets")(__merge(opts, { query: query })),
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
      /**
       * Build a mini app. Pass a sentence of intent (goes in as the prompt)
       * or a pinned BuildSpec object (goes in as the spec). Minutes-long —
       * pass {poll: true} for a session id to read instead of waiting.
       */
      build: (promptOrSpec, opts) =>
        __need("build_app")(
          __merge(
            opts,
            typeof promptOrSpec === "string"
              ? { prompt: promptOrSpec }
              : { spec: promptOrSpec }
          )
        ),
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

/** The full prelude: the namespace map plus the API definition. */
export const NODETOOL_API_PRELUDE_FULL = `${NAMESPACE_TOOLS_LITERAL}\n${NODETOOL_API_PRELUDE}`;

interface PromptEntry {
  /** Namespace key in {@link NODETOOL_API_NAMESPACE_TOOLS}. */
  namespace: string;
  /** Rendered doc lines for the prompt. */
  doc: string;
}

const NAMESPACE_DOCS: PromptEntry[] = [
  {
    namespace: "workflows",
    doc: `- \`nodetool.workflows\` — \`list()\` and \`examples()\` return \`{workflows}\`
  (an envelope, not a bare array), \`get(id)\`, \`run(id, params, {interactive})\`,
  \`start(id, params)\` (background job), \`debug(id, params)\`, \`validate(idOrGraph)\`,
  \`create(name, graph, {description, tags})\`, \`open(id?)\` (the editable object
  model — see the graph-editing section). An interactive run returns an
  escalation: answer it with \`resolve(sessionId, escalationId, action,
  {outputs, reason, apply_to})\` — retry/substitute/skip/end_stream/fail — and
  get the next escalation or the final report. Write the whole
  run-and-resolve loop (\`while (report.status === "escalated") ...\`) in one
  action. \`examples()\` lists the shipped
  example workflows and \`example("<package>/<name>")\` loads one with its
  graph, ready for \`nodetool.graph().copyFrom(...)\`.`
  },
  {
    namespace: "graph",
    doc: `- \`nodetool.graph(base?)\` — build an AD-HOC graph in code and run it, no editor
  needed. \`g.node(type, props)\` returns a ref; pass \`ref.output(slot?)\` as a
  property value to wire an edge (or \`g.connect(a, "output", b, "text")\`).
  \`g.copyFrom(workflowOrGraph, {prefix})\` copies another graph in (ids remapped;
  returns \`{idMap, refs}\` keyed by source id). \`await g.validate()\` before
  \`await g.run(params)\` (saves it tagged \`codeact-adhoc\`, then runs) or
  \`await g.save(name)\`.`
  },
  {
    namespace: "nodes",
    doc: `- \`nodetool.nodes\` — the graph builder's discovery half. NEVER guess a node
  type: \`await search(["summarize text"], {n_results, input_type, output_type})\`
  (a bare string works too) to find candidates, then
  \`await info("nodetool.text.Concat")\` for the exact properties, inputs and
  outputs before you write \`g.node(type, props)\`. \`list({namespace, limit})\`
  browses a namespace. \`run(type, inputs)\` is the single-node harness — probe
  one node with a property bag before wiring it into a graph.`
  },
  {
    namespace: "agents",
    doc: `- \`nodetool.agents\` — delegate to sub-agents. \`await run(prompt, {description})\`
  spawns a child with this belt's tools but a FRESH context: the prompt must be
  self-contained (ask for JSON in it when you want structure back).
  \`fanout(prompts, {concurrency})\` runs several with batch semantics — one
  settled \`{ok, value | error}\` entry per prompt. Delegate work that benefits
  from a fresh focused context, not one-tool errands.`
  },
  {
    namespace: "models",
    doc: `- \`nodetool.models\` — \`await pick(capability)\` resolves ONE ranked model
  (e.g. \`pick("text_to_image")\` → \`{provider, model_id}\`), \`find(capability,
  {task, provider_hint, prefer_local, limit})\` for the ranked list (returns
  \`{results}\`),
  \`list({provider, model_type})\` to browse. Never guess a model id — pick one,
  then pass it to \`nodetool.media.*\` or into node properties.`
  },
  {
    namespace: "providers",
    doc: `- \`nodetool.providers\` — \`list()\` (configured providers with model counts and
  types), \`models(provider)\` (one provider's catalog).`
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
  Judging lives here too, so generate → critique → regenerate is one namespace:
  \`critique(image, brief, visionModel, {taste_profile})\`,
  \`compare([imageA, imageB, ...], brief, visionModel)\` (pairwise knockout),
  \`scoreAdherence(image, brief, visionModel, {questions})\`. The judge takes a
  VISION chat model — \`pick("generate_message")\` on a vision-capable one, not
  the image model that generated the picture.`
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
    doc: `- \`nodetool.web\` — the outside world. \`await search(query, {provider})\` picks
  the best search backend this belt carries (\`provider\` pins one:
  \`"default"\`, \`"openai"\`, \`"google"\`, \`"dataforseo"\`), \`news(query)\` and
  \`images(query)\` are the vertical searches. \`browse(url)\` returns a page's
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
    namespace: "style",
    doc: `- \`nodetool.style\` — the user's accumulated taste. \`profile({query, k})\`
  returns a string block to inject into generation prompts and to pass as
  \`taste_profile\` to \`nodetool.media.critique/compare\`
  (\`profileDetails()\` returns that block plus the preference records behind
  it); \`record(takeaway, {chosen, rejected, brief})\` saves one preference
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
  \`get(assetId)\`, \`save(name, {...})\`, \`read(name)\`.`
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
    doc: `- \`nodetool.apps\` — \`build(promptOrSpec, {provider, model, workflow_ids,
  max_repairs, cost_cap_usd, poll})\` builds a mini app (a string is the intent
  prompt, an object is a pinned BuildSpec) and returns the build report; the
  bundle behind a passing verdict is offered, not installed. A build runs for
  MINUTES — pass \`{poll: true}\` to get a session id back at once and read
  \`GET /api/debug/sessions/<id>\` until it settles. \`debug(applicationId,
  {params, interact, run, poll})\` validates and simulates a saved app;
  \`{run: false}\` is the free, instant wiring check.`
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
const rows = data.parseCsv(await workspace.read("products.csv"));
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

const MEDIA_EXAMPLE = `Pick a model once, then generate — batching included:

\`\`\`js
const model = await nodetool.models.pick("text_to_image");
const shots = ["a red fox in snow", "a fox by a river"];
const images = await nodetool.batch(shots, (prompt) =>
  nodetool.media.generateImage(prompt, model), { concurrency: 2 });
return images.map((r) => (r.ok ? r.value.asset_uri : r.error));
\`\`\``;

const GRAPH_EXAMPLE = `Ad-hoc graph — compose and run a workflow entirely from code:

\`\`\`js
const g = nodetool.graph();
const inp = g.node("nodetool.input.StringInput", { name: "prompt" });
const img = g.node("nodetool.image.TextToImage", {
  prompt: inp.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
g.node("nodetool.output.ImageOutput", { name: "image", value: img.output() });
const check = await g.validate();          // fix issues before spending
const { workflow, result } = await g.run({ prompt: "a red fox in snow" });
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

export function buildNodetoolApiPromptSection(
  toolNames: Iterable<string>
): string {
  const names = new Set(toolNames);
  const active = NAMESPACE_DOCS.filter((entry) =>
    NODETOOL_API_NAMESPACE_TOOLS[entry.namespace].some((tool) =>
      names.has(tool)
    )
  );
  if (active.length === 0) return "";

  const sections: string[] = [
    `# The \`nodetool\` object model`,
    `Platform objects — workflows, graphs, models, media, documents — are
driven through \`nodetool.*\`, not through raw \`tools.*\` calls. The backing
tools are deliberately absent from the tool catalog above; this object model
is their one documented surface. \`nodetool.capabilities()\` reports what is
available. A method whose backing tool is missing throws and names the tool.`,
    active.map((entry) => entry.doc).join("\n")
  ];
  const hasGraph = NODETOOL_API_NAMESPACE_TOOLS["graph"].every((tool) =>
    names.has(tool)
  );
  if (hasGraph) sections.push(GRAPH_EXAMPLE);
  if (names.has("find_model") && names.has("generate_image")) {
    sections.push(MEDIA_EXAMPLE);
  }
  if (names.has("run_workflow")) sections.push(BATCH_EXAMPLE);
  if ([...names].some((name) => DOCUMENT_UI_TOOL_PREFIXES.some((p) => name.startsWith(p)))) {
    sections.push(DOCUMENT_SURFACE_GUIDANCE);
  }
  return sections.join("\n\n");
}
