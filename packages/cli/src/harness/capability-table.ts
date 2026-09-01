/**
 * GENERATED — the capability coverage table. Do not hand-edit anything but a
 * gap note; `npm run capabilities:sync` rewrites the rest.
 *
 * One entry per exported agent capability: the file that implements it, the
 * checked-in suites a selfcheck runs over it, the eval cases that drive a
 * model through it, and a written gap note where nothing does yet. The rules,
 * the audit, and the gate live in `capability-coverage.ts`; the derivation
 * lives in `scripts/sync-capability-coverage.mjs`.
 *
 * A new capability lands here with no suite and no eval case, and
 * `npm run capabilities:check` fails until someone either writes the case or
 * writes down why there isn't one.
 */

import type { CapabilityCoverageEntry } from "./capability-coverage.js";

export const CAPABILITY_COVERAGE: readonly CapabilityCoverageEntry[] = [
  {
    name: "list_workflows",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "21550fd305ce",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/nodetool-api-workflows.test.ts",
      "packages/agents/tests/capabilities-dispatcher.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-background-job-wait", "api-batch-existing-workflow"],
      },
    ],
  },
  {
    name: "get_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "500f60f725d0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-args.test.ts",
      "packages/agents/tests/capabilities-dispatcher.test.ts",
    ],
  },
  {
    name: "create_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "efc501df79a2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-adapters.test.ts",
      "packages/agents/tests/capabilities-dispatcher.test.ts",
    ],
  },
  {
    name: "update_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "136f6a0d501f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "delete_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "70ad54003754",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_workflow_versions",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "d08688d87b5f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/workflow-version-tools.test.ts",
    ],
  },
  {
    name: "get_workflow_version",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "4b4b302632da",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/workflow-version-tools.test.ts",
    ],
  },
  {
    name: "create_workflow_version",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "a61aa87a1700",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/workflow-version-tools.test.ts",
    ],
  },
  {
    name: "restore_workflow_version",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "2a57e08bef6f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/workflow-version-tools.test.ts",
    ],
  },
  {
    name: "delete_workflow_version",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "f01a9f5fd0e3",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/workflow-version-tools.test.ts",
    ],
  },
  {
    name: "set_workflow_access",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "66f81d2fb2c7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "run_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "759c359135dc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/nodetool-api-workflows.test.ts",
      "packages/agents/tests/capabilities-gate-parity.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-batch-existing-workflow", "api-graph-build-and-run", "api-interactive-escalation", "api-probe-node-then-wire"],
      },
    ],
  },
  {
    name: "debug_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "8a74fbe490d0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "resolve_workflow_escalation",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "42abfc3a3312",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/nodetool-api-workflows.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-interactive-escalation"],
      },
    ],
  },
  {
    name: "validate_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "7af3e305f546",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/nodetool-api-workflows.test.ts",
      "packages/agents/tests/capability-run-secrets-audit.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-graph-build-and-run"],
      },
    ],
  },
  {
    name: "start_background_job",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "ca27ce2245d7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-background-job-wait"],
      },
    ],
  },
  {
    name: "get_example_workflow",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "5f748ba651f3",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/nodetool-api-workflows.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "export_workflow_digraph",
    module: "workflows",
    impl: "packages/agents/src/capabilities/workflows.ts",
    contract: "adbf4387177b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "find_model",
    module: "models",
    impl: "packages/agents/src/capabilities/models.ts",
    contract: "e7361c656213",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-models.test.ts",
      "packages/agents/tests/capabilities-models-rankings.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-generate-then-critique", "api-pick-model-and-batch-images"],
      },
    ],
  },
  {
    name: "list_models",
    module: "models",
    impl: "packages/agents/src/capabilities/models.ts",
    contract: "aa55d4d361d6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-models.test.ts",
      "packages/agents/tests/capability-run-secrets-audit.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-pick-model-and-batch-images"],
      },
    ],
  },
  {
    name: "list_provider_models",
    module: "models",
    impl: "packages/agents/src/capabilities/models.ts",
    contract: "af8e36f33309",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-models.test.ts",
    ],
  },
  {
    name: "generate_image",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "76c74760b1a5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-generate-then-critique", "api-pick-model-and-batch-images"],
      },
      {
        file: "packages/agents/src/evals/surfaces/memory.ts",
        cases: ["generate-and-remember"],
      },
    ],
  },
  {
    name: "edit_image",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "b672040eb8cc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "generate_video",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "d9a615c3b294",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "animate_image",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "238dee9f0bd0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "generate_speech",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "70c9eaa92c86",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "generate_music",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "b5e4b823fb81",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "transcribe_audio",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "be650010c230",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "embed_text",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "7ccf08214e00",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "read_media_bytes",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "57305485ad36",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "critique_image",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "d46bd53f7dfd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-generate-then-critique"],
      },
    ],
  },
  {
    name: "compare_images",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "426279b0dd84",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "score_image_adherence",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "27f4c2507b82",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "understand_video",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "a5a78285c120",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "ffmpeg",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "433178927e9f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
      "packages/agents/tests/capabilities-media-ffprobe.test.ts",
    ],
  },
  {
    name: "ffprobe",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "4ac5df4ed873",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
      "packages/agents/tests/capabilities-media-ffprobe.test.ts",
    ],
  },
  {
    name: "yt_dlp",
    module: "media",
    impl: "packages/agents/src/capabilities/media.ts",
    contract: "9c06b831c290",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "list_collections",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "229fb4676997",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "query_collection",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "1759e46aff01",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["rag-index-and-answer"],
      },
    ],
  },
  {
    name: "vector_text_search",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "d8bee8d9430c",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["rag-index-and-answer"],
      },
    ],
  },
  {
    name: "vector_index",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "a270bb328fac",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "vector_hybrid_search",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "c539b3772a27",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "vector_recursive_split_and_index",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "d76cb2befb82",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "vector_markdown_split_and_index",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "38746e1afe7b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "vector_batch_index",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "deb290cc67c1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "create_collection",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "4fd457fa1ff6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "delete_collection",
    module: "collections",
    impl: "packages/agents/src/capabilities/collections.ts",
    contract: "eb59236a182f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-collections.test.ts",
    ],
  },
  {
    name: "get_cost_summary",
    module: "costs",
    impl: "packages/agents/src/capabilities/costs.ts",
    contract: "2c90c598b870",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_nodes",
    module: "nodes",
    impl: "packages/agents/src/capabilities/nodes.ts",
    contract: "6f70c870b22f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-nodes.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "search_nodes",
    module: "nodes",
    impl: "packages/agents/src/capabilities/nodes.ts",
    contract: "600f8b51d0d0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-nodes.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-graph-build-and-run"],
      },
    ],
  },
  {
    name: "get_node_info",
    module: "nodes",
    impl: "packages/agents/src/capabilities/nodes.ts",
    contract: "15eadde2f065",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-nodes.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "list_jobs",
    module: "jobs",
    impl: "packages/agents/src/capabilities/jobs.ts",
    contract: "2d22d3a3e08e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-jobs.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "get_job",
    module: "jobs",
    impl: "packages/agents/src/capabilities/jobs.ts",
    contract: "2beacec6db44",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-jobs.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-background-job-wait"],
      },
    ],
  },
  {
    name: "get_job_logs",
    module: "jobs",
    impl: "packages/agents/src/capabilities/jobs.ts",
    contract: "e4eb72a3bb2e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-jobs.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "cancel_job",
    module: "jobs",
    impl: "packages/agents/src/capabilities/jobs.ts",
    contract: "0e7a1fa204a4",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-jobs.test.ts",
    ],
  },
  {
    name: "list_assets",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "0a9994a19245",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/capabilities-dispatcher.test.ts",
    ],
  },
  {
    name: "get_asset",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "9f3234517e74",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "save_asset",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "dfb0317d6e85",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-asset-round-trip"],
      },
    ],
  },
  {
    name: "read_asset",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "754ddc200ba0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-asset-round-trip"],
      },
    ],
  },
  {
    name: "asset_search",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "48cf8b892c51",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
  },
  {
    name: "asset_list",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "22be9a0e970d",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
  },
  {
    name: "list_images",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "c7ae881622fd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
    ],
  },
  {
    name: "view_image",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "c8433ab4fc37",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/capabilities-media.test.ts",
    ],
  },
  {
    name: "update_asset",
    module: "assets",
    impl: "packages/agents/src/capabilities/assets.ts",
    contract: "8dfc3e1b4b9e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-assets.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "browser_status",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "58ec839719ca",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_view",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "b4c94f55cac8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_navigate",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "9660cd6b5c02",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_restart",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "defb85a11e39",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_click",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "d1b6b204cd27",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_input_text",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "4d24b135bb69",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_move_mouse",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "1a36915fa601",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_press_key",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "d1b1b2fc95c9",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_select_option",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "73c53d222990",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_scroll",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "e2012b881bd6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_console_exec",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "7add1995b4bc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_console_view",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "daf5f59b767f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_capture_media",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "92363bd381a2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "browser_upload_asset",
    module: "browser",
    impl: "packages/agents/src/capabilities/browser.ts",
    contract: "f083302fd2b9",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-browser.test.ts",
    ],
  },
  {
    name: "debug_app",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "32879e98374d",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["app-wiring-check"],
      },
    ],
  },
  {
    name: "list_apps",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "8e4f918a4fb5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "get_app",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "999e2a10fccb",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "create_app",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "af8025058000",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "edit_app",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "80aab4b438b8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
  },
  {
    name: "delete_app",
    module: "apps",
    impl: "packages/agents/src/capabilities/apps.ts",
    contract: "34f77614fa6d",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-apps.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "extract_pdf_text",
    module: "documents",
    impl: "packages/agents/src/capabilities/documents.ts",
    contract: "6d8881cf9905",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-documents.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["document-extraction-pipeline"],
      },
    ],
  },
  {
    name: "extract_pdf_tables",
    module: "documents",
    impl: "packages/agents/src/capabilities/documents.ts",
    contract: "93a9a586177e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-documents.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["document-extraction-pipeline"],
      },
    ],
  },
  {
    name: "convert_pdf_to_markdown",
    module: "documents",
    impl: "packages/agents/src/capabilities/documents.ts",
    contract: "062520f6ddaf",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-documents.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["document-extraction-pipeline"],
      },
    ],
  },
  {
    name: "convert_markdown_to_pdf",
    module: "documents",
    impl: "packages/agents/src/capabilities/documents.ts",
    contract: "b4cb1118c47b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-documents.test.ts",
    ],
  },
  {
    name: "convert_document",
    module: "documents",
    impl: "packages/agents/src/capabilities/documents.ts",
    contract: "8366c856fff5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-documents.test.ts",
    ],
  },
  {
    name: "search_email",
    module: "email",
    impl: "packages/agents/src/capabilities/email.ts",
    contract: "009d8426f54e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-email.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["email-triage"],
      },
    ],
  },
  {
    name: "archive_email",
    module: "email",
    impl: "packages/agents/src/capabilities/email.ts",
    contract: "cd1a4980a2db",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-email.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["email-triage"],
      },
    ],
  },
  {
    name: "add_label_to_email",
    module: "email",
    impl: "packages/agents/src/capabilities/email.ts",
    contract: "e6eadbfd482c",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-email.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["email-triage"],
      },
    ],
  },
  {
    name: "memory_save",
    module: "memory",
    impl: "packages/agents/src/capabilities/memory.ts",
    contract: "3ce3bc95c763",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-memory.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["memory-lifecycle"],
      },
      {
        file: "packages/agents/src/evals/surfaces/memory.ts",
        cases: ["generate-and-remember"],
      },
    ],
  },
  {
    name: "memory_list",
    module: "memory",
    impl: "packages/agents/src/capabilities/memory.ts",
    contract: "3f0c7dee6c36",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-memory.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["memory-lifecycle"],
      },
      {
        file: "packages/agents/src/evals/surfaces/memory.ts",
        cases: ["recall-existing"],
      },
    ],
  },
  {
    name: "memory_search",
    module: "memory",
    impl: "packages/agents/src/capabilities/memory.ts",
    contract: "611215d2c382",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-memory.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/surfaces/memory.ts",
        cases: ["search-across-threads"],
      },
    ],
  },
  {
    name: "memory_update",
    module: "memory",
    impl: "packages/agents/src/capabilities/memory.ts",
    contract: "1366d2d42ae6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-memory.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["memory-lifecycle"],
      },
    ],
  },
  {
    name: "memory_delete",
    module: "memory",
    impl: "packages/agents/src/capabilities/memory.ts",
    contract: "b5a1bfc659ec",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-memory.test.ts",
      "packages/agents/tests/memory-tools.test.ts",
    ],
  },
  {
    name: "list_shared",
    module: "shared",
    impl: "packages/agents/src/capabilities/shared.ts",
    contract: "2ce5956cae84",
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["shared-handoff"],
      },
    ],
  },
  {
    name: "read_shared",
    module: "shared",
    impl: "packages/agents/src/capabilities/shared.ts",
    contract: "8df73f7ba674",
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["shared-handoff"],
      },
    ],
  },
  {
    name: "share_result",
    module: "shared",
    impl: "packages/agents/src/capabilities/shared.ts",
    contract: "51e593b67d6a",
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["shared-handoff"],
      },
    ],
  },
  {
    name: "web_search",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "e4946512515e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/capabilities-threads.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["web-research-brief"],
      },
    ],
  },
  {
    name: "image_search",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "3c50d887acb1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/capability-module-exports.test.ts",
    ],
  },
  {
    name: "browser",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "f462e9c43b8e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "take_screenshot",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "6990fdc0a93a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/browser-tools.test.ts",
    ],
  },
  {
    name: "download_file",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "29547bbe8c33",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/capabilities-web-download.test.ts",
    ],
  },
  {
    name: "http_request",
    module: "web",
    impl: "packages/agents/src/capabilities/web.ts",
    contract: "8f88568453f5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-web.test.ts",
      "packages/agents/tests/capabilities-gate-parity.test.ts",
    ],
  },
  {
    name: "read_file",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "47c3c494861d",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "write_file",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "ef2b4b130fad",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "list_directory",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "46957c0d5f46",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "edit_file",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "af00c00c67c5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "glob",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "4095f07d31d7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "grep",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "b44ec5de4b68",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
      "packages/agents/tests/capabilities-files-virtual.test.ts",
    ],
  },
  {
    name: "todo_write",
    module: "files",
    impl: "packages/agents/src/capabilities/files.ts",
    contract: "46879814ae61",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-files.test.ts",
    ],
  },
  {
    name: "run_subtask",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "9ede211359e7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
      "packages/agents/tests/capabilities-gate-parity.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-core.ts",
        cases: ["api-delegate-subtask"],
      },
    ],
  },
  {
    name: "run_search",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "4d4c6ddc88ee",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
    ],
  },
  {
    name: "start_subtask",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "cbd1367c51d6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
    ],
  },
  {
    name: "wait_subtasks",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "761238019e95",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
    ],
  },
  {
    name: "create_plan",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "b3a92d89d2f2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
    ],
  },
  {
    name: "execute_plan",
    module: "agents",
    impl: "packages/agents/src/capabilities/agents.ts",
    contract: "322f965a870f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-agents.test.ts",
    ],
  },
  {
    name: "google_drive_search",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "5eb13fc29956",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_drive_read_file",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "0faf5cd573c3",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_drive_get_file",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "afdc399211bb",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_drive_create_file",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "cd4796152389",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "gmail_search",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "c95cdb216e9c",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "gmail_get_message",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "f05758fd1d38",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "gmail_send_message",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "9bd61587642a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "gmail_modify_labels",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "3817260faa01",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "gmail_list_labels",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "0e9627c9efcd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_docs_read",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "26bd47cd6a0f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_docs_create",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "456bad82acbc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_docs_append",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "eb73d01f558b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_sheets_read",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "3a21bbb8c59f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_sheets_append",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "f0f81493694e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_sheets_update",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "47e7930f9810",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_sheets_create",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "ba23cc1b88c6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_calendar_list_calendars",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "151e73884ee0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_calendar_list_events",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "539122030fbd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_calendar_create_event",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "7e6f8ec90cbc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "google_calendar_delete_event",
    module: "google",
    impl: "packages/agents/src/capabilities/google.ts",
    contract: "cf6421e03cd2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-google.test.ts",
    ],
  },
  {
    name: "list_threads",
    module: "threads",
    impl: "packages/agents/src/capabilities/threads.ts",
    contract: "d73f9ee0bda4",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-threads.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["threads-recall"],
      },
    ],
  },
  {
    name: "get_thread",
    module: "threads",
    impl: "packages/agents/src/capabilities/threads.ts",
    contract: "6552626c45a6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-threads.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["threads-recall"],
      },
    ],
  },
  {
    name: "get_message",
    module: "threads",
    impl: "packages/agents/src/capabilities/threads.ts",
    contract: "083087750456",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-threads.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["threads-recall"],
      },
    ],
  },
  {
    name: "list_timelines",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "60d09f71d39c",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "create_timeline",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "280ed2d9ce0b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "get_timeline",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "1f500cb8f942",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "list_timeline_versions",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "e8d8eabc91e1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "get_timeline_version",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "8b9464fb8c3c",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "create_timeline_version",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "df0b3a5b805f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["timeline-fix-and-validate"],
      },
    ],
  },
  {
    name: "restore_timeline_version",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "3acd389edc7e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "delete_timeline_version",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "8c8f167074d4",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
  },
  {
    name: "edit_timeline",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "5fbf0507f620",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["timeline-fix-and-validate"],
      },
    ],
  },
  {
    name: "validate_timeline",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "7ac84457c86e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["timeline-fix-and-validate"],
      },
      {
        file: "packages/agents/src/evals/surfaces/creative-pipeline.ts",
        cases: ["script-to-linked-cut"],
      },
    ],
  },
  {
    name: "preview_timeline_frame",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "b1f3d66eccce",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
      "packages/agents/tests/capabilities-timeline-preview.test.ts",
    ],
  },
  {
    name: "delete_timeline",
    module: "timelines",
    impl: "packages/agents/src/capabilities/timelines.ts",
    contract: "8a3eb82365c0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-timelines.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_sketches",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "be444e7d7d9a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "create_sketch",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "72b119db3396",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "get_sketch",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "0ccfe3a6d5d1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "list_sketch_versions",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "2891d6c3f462",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "get_sketch_version",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "54ad47fe5baa",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "create_sketch_version",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "e388aa0edf99",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "restore_sketch_version",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "67e7a2ddc682",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "delete_sketch_version",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "4fb74f78a618",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
  },
  {
    name: "edit_sketch",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "8592a69488a7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["sketch-layer-repair"],
      },
    ],
  },
  {
    name: "validate_sketch",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "6ff561f86c35",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["sketch-layer-repair"],
      },
    ],
  },
  {
    name: "delete_sketch",
    module: "sketches",
    impl: "packages/agents/src/capabilities/sketches.ts",
    contract: "8a4a0df4daf9",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-sketches.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_model3ds",
    module: "model3d",
    impl: "packages/agents/src/capabilities/model3d.ts",
    contract: "a2b4b5c96430",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-model3d.test.ts",
    ],
  },
  {
    name: "create_model3d",
    module: "model3d",
    impl: "packages/agents/src/capabilities/model3d.ts",
    contract: "fe21d44be4b5",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-model3d.test.ts",
    ],
  },
  {
    name: "get_model3d",
    module: "model3d",
    impl: "packages/agents/src/capabilities/model3d.ts",
    contract: "4405bcfef4c1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-model3d.test.ts",
    ],
  },
  {
    name: "edit_model3d",
    module: "model3d",
    impl: "packages/agents/src/capabilities/model3d.ts",
    contract: "1cb386cf7cbd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-model3d.test.ts",
    ],
  },
  {
    name: "validate_model3d",
    module: "model3d",
    impl: "packages/agents/src/capabilities/model3d.ts",
    contract: "e317eef26924",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-model3d.test.ts",
    ],
  },
  {
    name: "list_scripts",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "915ad505a9f2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "create_script",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "ceac594f5274",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "get_script",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "705cc1145075",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "voice_script_lines",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "6cb7a132ea53",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["script-voice-and-assemble"],
      },
    ],
  },
  {
    name: "assemble_script_timeline",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "3df3dd02eba0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["script-voice-and-assemble"],
      },
    ],
  },
  {
    name: "edit_script",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "0d3075938411",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "derive_storyboard_from_script",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "96a41b5c30a7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
    ],
  },
  {
    name: "delete_script",
    module: "scripts",
    impl: "packages/agents/src/capabilities/scripts.ts",
    contract: "d2d070ab0705",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-scripts.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_storyboards",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "3d3f1e6f7ce6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
  },
  {
    name: "create_storyboard",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "90b995271f45",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
  },
  {
    name: "get_storyboard",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "a9792020b14a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["storyboard-direct-shots"],
      },
    ],
  },
  {
    name: "render_storyboard_stills",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "ad4811893137",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["storyboard-render-and-assemble"],
      },
    ],
  },
  {
    name: "render_storyboard_clips",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "7cfc44e9c9d6",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["storyboard-render-and-assemble"],
      },
    ],
  },
  {
    name: "revise_storyboard_clip",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "6ffde89a2dee",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
  },
  {
    name: "assemble_storyboard_timeline",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "4f90b57e8da8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["storyboard-render-and-assemble"],
      },
    ],
  },
  {
    name: "edit_storyboard",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "9b3c1f3f93a1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["storyboard-direct-shots"],
      },
    ],
  },
  {
    name: "extract_script_from_storyboard",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "fb432273a11a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
    ],
  },
  {
    name: "delete_storyboard",
    module: "storyboards",
    impl: "packages/agents/src/capabilities/storyboards.ts",
    contract: "fcec52d68eb0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-storyboards.test.ts",
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "list_entities",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "2ddba3ac5165",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "get_entity",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "6af0acba8645",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "apply_entities",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "34c14b907c14",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "create_entity",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "c566aa83ff94",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "update_entity",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "0364dc0ba668",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "delete_entity",
    module: "entities",
    impl: "packages/agents/src/capabilities/entities.ts",
    contract: "6d2e841db72f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-entities.test.ts",
    ],
  },
  {
    name: "validate_code",
    module: "code",
    impl: "packages/agents/src/capabilities/code.ts",
    contract: "8c6ce58f65fc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/code-capabilities.test.ts",
    ],
  },
  {
    name: "run_code",
    module: "code",
    impl: "packages/agents/src/capabilities/code.ts",
    contract: "ff41dab56c40",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/code-capabilities.test.ts",
    ],
  },
  {
    name: "test_code",
    module: "code",
    impl: "packages/agents/src/capabilities/code.ts",
    contract: "8db4b25f2583",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/code-capabilities.test.ts",
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "invoke_node",
    module: "flow",
    impl: "packages/agents/src/capabilities/flow.ts",
    contract: "9c194a0446f7",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-flow.test.ts",
    ],
  },
  {
    name: "open_node_stream",
    module: "flow",
    impl: "packages/agents/src/capabilities/flow.ts",
    contract: "4520058d2c85",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-flow.test.ts",
    ],
  },
  {
    name: "take_node_stream",
    module: "flow",
    impl: "packages/agents/src/capabilities/flow.ts",
    contract: "b9d2126bc6aa",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-flow.test.ts",
    ],
  },
  {
    name: "close_node_stream",
    module: "flow",
    impl: "packages/agents/src/capabilities/flow.ts",
    contract: "959fd84b20d1",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-flow.test.ts",
    ],
  },
  {
    name: "list_js_scripts",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "d212a2c14484",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "get_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "58bd4cdcbc2f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "save_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "b6323e3dc559",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "validate_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "d7c93528a54e",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "run_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "f57c0b842920",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "test_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "db2fc27723bc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "list_js_script_versions",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "1251a24e6d23",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "get_js_script_version",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "36cb408aac3f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "create_js_script_version",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "d75395b3484a",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "restore_js_script_version",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "7573bab23a6b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "delete_js_script_version",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "bdbdca988955",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/js-scripts-capabilities.test.ts",
    ],
  },
  {
    name: "delete_js_script",
    module: "js-scripts",
    impl: "packages/agents/src/capabilities/js-scripts.ts",
    contract: "a5f048e679e4",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-lifecycle.test.ts",
    ],
  },
  {
    name: "get_sandbox_package_docs",
    module: "packs",
    impl: "packages/agents/src/capabilities/packs.ts",
    contract: "c1e9c5c4ab71",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/sandbox-package-docs.test.ts",
    ],
  },
  {
    name: "list_sandbox_packages",
    module: "packs",
    impl: "packages/agents/src/capabilities/packs.ts",
    contract: "0614b41b2a78",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/sandbox-package-listing.test.ts",
    ],
  },
  {
    name: "ui_get_graph",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "c758c2ba012f",
    gap:
      "Schema-only capability: the implementation is the browser's " +
      "(web/src/lib/tools/builtin), and the headless graph bridge the " +
      "tool-loop eval drives seeds its own state instead of reading " +
      "it back. A case whose objective needs the current graph before " +
      "editing it would close it.",
  },
  {
    name: "ui_add_node",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "6e7762c2d21d",
    evals: [
      {
        file: "packages/agents/src/evals/escalation-cases.ts",
        cases: ["ask-for-missing-names", "ask-which-step", "escalate-missing-capability", "no-escalation-needed"],
      },
      {
        file: "packages/agents/src/evals/tool-loop-cases.ts",
        cases: ["extend-existing", "summarize"],
      },
    ],
  },
  {
    name: "ui_connect_nodes",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "2b693a52d557",
    evals: [
      {
        file: "packages/agents/src/evals/escalation-cases.ts",
        cases: ["ask-for-missing-names", "ask-which-step", "escalate-missing-capability", "no-escalation-needed"],
      },
      {
        file: "packages/agents/src/evals/tool-loop-cases.ts",
        cases: ["extend-existing", "summarize"],
      },
    ],
  },
  {
    name: "ui_update_node_data",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "53ad5b26a7d1",
    gap:
      "Schema-only capability routed to the browser. The graph " +
      "tool-loop cases add and connect nodes; none sets a property " +
      "afterwards. A case that builds a graph and then fills a " +
      "required property would close it.",
  },
  {
    name: "ui_delete_node",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "a93cf9eecae0",
    evals: [
      {
        file: "packages/agents/src/evals/escalation-cases.ts",
        cases: ["confirm-before-delete"],
      },
    ],
  },
  {
    name: "ui_delete_edge",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "43bb0e75e132",
    gap:
      "Schema-only capability routed to the browser. No tool-loop " +
      "case rewires a seeded graph. A case that disconnects and " +
      "reconnects an edge would close it.",
  },
  {
    name: "ui_move_node",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "35780f769033",
    gap:
      "Schema-only capability routed to the browser. Layout is not " +
      "scored by any case. A case whose final-state predicate reads " +
      "node positions would close it.",
  },
  {
    name: "ui_set_node_title",
    module: "ui",
    impl: "packages/agents/src/capabilities/ui.ts",
    contract: "b8500a8d6207",
    gap:
      "Schema-only capability routed to the browser. No case renames " +
      "a node. A case that titles the nodes it adds would close it.",
  },
  {
    name: "search_apify_actors",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "50af542cf6f8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "get_apify_actor",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "09ec9f55bd63",
    gap:
      "The Apify suites cover search, schema, run, abort, and the " +
      "dataset reader; fetching one actor's record has no case. A " +
      "read-only case against the recorded actor fixture would close " +
      "it.",
  },
  {
    name: "get_apify_actor_schema",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "34c022823a29",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
      "packages/agents/tests/capabilities-args.test.ts",
    ],
  },
  {
    name: "run_apify_actor",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "cf4fb14ea0de",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "get_apify_run",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "c37157bc759d",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "abort_apify_run",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "a7cbc2ab4845",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "get_apify_dataset_items",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "020cbfa36319",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/apify-capabilities.test.ts",
    ],
  },
  {
    name: "get_apify_key_value_record",
    module: "apify",
    impl: "packages/agents/src/capabilities/apify.ts",
    contract: "73208a1ca49b",
    gap:
      "The dataset reader is covered, the key-value reader is not. A " +
      "case that runs an actor writing to the store and reads one " +
      "record back would close it.",
  },
  {
    name: "list_serpapi_engines",
    module: "serpapi",
    impl: "packages/agents/src/capabilities/serpapi.ts",
    contract: "75de5f72edf2",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/serpapi-capabilities.test.ts",
    ],
  },
  {
    name: "get_serpapi_engine_schema",
    module: "serpapi",
    impl: "packages/agents/src/capabilities/serpapi.ts",
    contract: "104ab31876fd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/serpapi-capabilities.test.ts",
    ],
  },
  {
    name: "serpapi_search",
    module: "serpapi",
    impl: "packages/agents/src/capabilities/serpapi.ts",
    contract: "e5e0e423dada",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/serpapi-capabilities.test.ts",
    ],
  },
  {
    name: "get_serpapi_account",
    module: "serpapi",
    impl: "packages/agents/src/capabilities/serpapi.ts",
    contract: "4bb30a68b979",
    gap:
      "The SerpAPI suites cover engine discovery, schema, search, and " +
      "locations; the account/quota read has no case. A case that " +
      "reads the remaining searches before a budgeted fan-out would " +
      "close it.",
  },
  {
    name: "get_serpapi_locations",
    module: "serpapi",
    impl: "packages/agents/src/capabilities/serpapi.ts",
    contract: "a5a352a564d3",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/serpapi-capabilities.test.ts",
    ],
  },
  {
    name: "list_settings",
    module: "settings",
    impl: "packages/agents/src/capabilities/settings.ts",
    contract: "db413f34a932",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-settings.test.ts",
    ],
  },
  {
    name: "get_setting",
    module: "settings",
    impl: "packages/agents/src/capabilities/settings.ts",
    contract: "d87d447224c8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-settings.test.ts",
    ],
  },
  {
    name: "set_setting",
    module: "settings",
    impl: "packages/agents/src/capabilities/settings.ts",
    contract: "45361d7bbdb8",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-settings.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["settings-and-credentials"],
      },
    ],
  },
  {
    name: "list_secrets",
    module: "settings",
    impl: "packages/agents/src/capabilities/settings.ts",
    contract: "2001f833fde0",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-settings.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["settings-and-credentials"],
      },
    ],
  },
  {
    name: "request_secret",
    module: "settings",
    impl: "packages/agents/src/capabilities/settings.ts",
    contract: "adad33baaa59",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-settings.test.ts",
      "packages/agents/tests/mcp-tools.test.ts",
    ],
    evals: [
      {
        file: "packages/agents/src/evals/codeact-api-surfaces.ts",
        cases: ["settings-and-credentials"],
      },
    ],
  },
  {
    name: "list_skills",
    module: "skills",
    impl: "packages/agents/src/capabilities/skills.ts",
    contract: "2963789253ad",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-skills.test.ts",
    ],
  },
  {
    name: "load_skill",
    module: "skills",
    impl: "packages/agents/src/capabilities/skills.ts",
    contract: "33b2c6e9e7e4",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-skills.test.ts",
    ],
  },
  {
    name: "create_skill",
    module: "skills",
    impl: "packages/agents/src/capabilities/skills.ts",
    contract: "6404db74f39b",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-skills.test.ts",
    ],
  },
  {
    name: "update_skill",
    module: "skills",
    impl: "packages/agents/src/capabilities/skills.ts",
    contract: "29a0aa33a2aa",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-skills.test.ts",
    ],
  },
  {
    name: "delete_skill",
    module: "skills",
    impl: "packages/agents/src/capabilities/skills.ts",
    contract: "29ca02ca69cc",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-skills.test.ts",
    ],
  },
  {
    name: "analyze_audio",
    module: "analysis",
    impl: "packages/agents/src/capabilities/analysis.ts",
    contract: "328dadfe45f9",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-analysis.test.ts",
    ],
  },
  {
    name: "analyze_audio_spectrum",
    module: "analysis",
    impl: "packages/agents/src/capabilities/analysis.ts",
    contract: "00830f0c748f",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-analysis.test.ts",
    ],
  },
  {
    name: "detect_audio_events",
    module: "analysis",
    impl: "packages/agents/src/capabilities/analysis.ts",
    contract: "064835616149",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-analysis.test.ts",
    ],
  },
  {
    name: "analyze_video",
    module: "analysis",
    impl: "packages/agents/src/capabilities/analysis.ts",
    contract: "ff8fa9e395bd",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-analysis.test.ts",
    ],
  },
  {
    name: "detect_video_scenes",
    module: "analysis",
    impl: "packages/agents/src/capabilities/analysis.ts",
    contract: "9421a263a2f3",
    selfcheck: "capability-suites",
    suites: [
      "packages/agents/tests/capabilities-analysis.test.ts",
    ],
  },
];
