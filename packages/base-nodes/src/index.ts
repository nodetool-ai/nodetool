/**
 * @nodetool-ai/base-nodes — compatibility shell.
 *
 * The original monolithic `base-nodes` package was split into 11 focused
 * sub-packages. This shell re-exports their public surfaces so that
 * existing consumers (`websocket`, `cli`, `electron`, tests) that import
 * from `@nodetool-ai/base-nodes` keep building without changes.
 *
 * New code should depend directly on the relevant sub-package:
 *
 *   - @nodetool-ai/core-nodes        — pure-JS logic (control, constants, list, input, subgraph, workflow, vector, datetime, validate)
 *   - @nodetool-ai/text-nodes        — text, NLP, markdown, HTML parse, SVG
 *   - @nodetool-ai/llm-nodes         — LLM providers + agent loops
 *   - @nodetool-ai/data-nodes        — dataframes, RSS, charts
 *   - @nodetool-ai/document-nodes    — DOCX, EPUB, PPTX, PDF, doc conversion
 *   - @nodetool-ai/image-nodes       — sharp + WebGPU shader image nodes
 *   - @nodetool-ai/audio-nodes       — audio I/O, DSP, effects
 *   - @nodetool-ai/video-nodes       — video, video download, 3D models
 *   - @nodetool-ai/integration-nodes — external APIs (HTTP, S3, Supabase, Notion, Twilio, mail, etc.)
 *   - @nodetool-ai/code-nodes        — JS code, sandbox, agent tool wrappers
 *   - @nodetool-ai/automation-nodes  — browser, OS, FS workspace, triggers, SQLite, OCR, Excel, TF
 */

// ── core ────────────────────────────────────────────────────────────────
export {
  CONTROL_NODES,
  COMPARE_NODES,
  CONSTANT_NODES,
  LIST_NODES,
  INPUT_NODES,
  SUBGRAPH_NODES,
  WORKFLOW_NODES,
  VECTOR_NODES,
  EXTENDED_PLACEHOLDER_NODES,
  LIB_DATETIME_NODES,
  LIB_VALIDATE_NODES,
  SubgraphNode,
  WorkflowNode
} from "@nodetool-ai/core-nodes";

// ── text ────────────────────────────────────────────────────────────────
export {
  TEXT_EXTRA_NODES,
  LIB_NLP_NODES,
  LIB_MARKDOWN_NODES,
  LIB_BEAUTIFULSOUP_NODES,
  LIB_SVG_NODES
} from "@nodetool-ai/text-nodes";

// ── llm ─────────────────────────────────────────────────────────────────
export {
  AGENT_NODES,
  GEMINI_NODES,
  OPENAI_NODES,
  MISTRAL_NODES,
  GENERATOR_NODES,
  TEAM_NODES,
  registerBuiltinAgentToolClasses,
  resolveBuiltinAgentTool,
  hydrateBuiltinAgentTool,
  hydrateBuiltinAgentTools,
  runAgentLoop,
  type ToolLike
} from "@nodetool-ai/llm-nodes";

// ── data ────────────────────────────────────────────────────────────────
export {
  DATA_NODES,
  LIB_RSS_NODES,
  LIB_SEABORN_NODES
} from "@nodetool-ai/data-nodes";

// ── document ────────────────────────────────────────────────────────────
export {
  DOCUMENT_NODES,
  LIB_DOCX_NODES,
  LIB_EPUB_NODES,
  LIB_PPTX_NODES,
  LIB_PDF_NODES,
  LIB_MARKITDOWN_NODES,
  LIB_PANDOC_NODES
} from "@nodetool-ai/document-nodes";

// ── image ───────────────────────────────────────────────────────────────
export {
  IMAGE_NODES,
  LIB_IMAGE_CHANNEL_NODES,
  LIB_IMAGE_COLOR_GRADING_NODES,
  LIB_IMAGE_COLOR_NODES,
  LIB_IMAGE_DRAW_NODES,
  LIB_IMAGE_EFFECTS_NODES,
  LIB_IMAGE_ENHANCE_NODES,
  LIB_IMAGE_FILTER_EXTRAS_NODES,
  LIB_IMAGE_FILTER_NODES,
  LIB_IMAGE_GENERATORS_NODES,
  LIB_IMAGE_KEYER_NODES,
  LIB_IMAGE_MASK_NODES,
  LIB_IMAGE_WARP_NODES,
  LIB_GRID_NODES,
  CompositorNode,
  PainterNode,
  LevelsNode,
  decodeRgba,
  rawRgbaImageRef
} from "@nodetool-ai/image-nodes";

// ── audio ───────────────────────────────────────────────────────────────
export {
  AUDIO_NODES,
  LIB_AUDIO_DSP_NODES,
  LIB_PEDALBOARD_EXTRA_NODES,
  OUTPUT_NODES,
  audioBytes,
  audioBytesAsync,
  audioRefFromBytes,
  audioRefFromWav,
  concatBytes,
  encodePcm16Wav,
  encodeWav,
  parseWavBytes,
  toBytes,
  tryDecodeWav,
  uriToPath,
  type WavData,
  ConcatAudioNode
} from "@nodetool-ai/audio-nodes";

// ── video ───────────────────────────────────────────────────────────────
export {
  VIDEO_NODES,
  LIB_YTDLP_NODES,
  MODEL3D_NODES,
  AddAudioVideoNode
} from "@nodetool-ai/video-nodes";

// ── integration ─────────────────────────────────────────────────────────
export {
  LIB_HTTP_NODES,
  LIB_GRAPHQL_NODES,
  LIB_S3_NODES,
  LIB_SUPABASE_NODES,
  LIB_NOTION_NODES,
  LIB_TWILIO_NODES,
  APIFY_NODES,
  LIB_MAIL_NODES,
  LIB_SECRET_NODES,
  MESSAGING_NODES,
  SEARCH_NODES,
  KIE_DYNAMIC_NODES,
  KieAINode,
  resolveKieDynamicSchema,
  type ResolvedKieDynamicSchema,
  GoogleSearchNode
} from "@nodetool-ai/integration-nodes";

// ── code ────────────────────────────────────────────────────────────────
export {
  CODE_NODES,
  CodeNode,
  SANDBOX_NODES,
  TOOL_AGENT_NODES,
  ExecuteBashNode,
  ExecutePythonNode
} from "@nodetool-ai/code-nodes";

// ── automation ──────────────────────────────────────────────────────────
export {
  LIB_BROWSER_NODES,
  LIB_OS_NODES,
  WORKSPACE_NODES,
  TRIGGER_NODES,
  LIB_SQLITE_NODES,
  LIB_OCR_NODES,
  LIB_EXCEL_NODES,
  LIB_TENSORFLOW_NODES,
  buildBrowserAgentToolClasses,
  SpiderCrawlLibNode
} from "@nodetool-ai/automation-nodes";

// ── Aggregate registration shim ─────────────────────────────────────────

import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";

import {
  CONTROL_NODES as _CONTROL_NODES,
  LIST_NODES as _LIST_NODES,
  CONSTANT_NODES as _CONSTANT_NODES,
  EXTENDED_PLACEHOLDER_NODES as _EXTENDED_PLACEHOLDER_NODES,
  INPUT_NODES as _INPUT_NODES,
  WORKFLOW_NODES as _WORKFLOW_NODES,
  SUBGRAPH_NODES as _SUBGRAPH_NODES,
  COMPARE_NODES as _COMPARE_NODES,
  LIB_DATETIME_NODES as _LIB_DATETIME_NODES,
  LIB_VALIDATE_NODES as _LIB_VALIDATE_NODES,
  VECTOR_NODES as _VECTOR_NODES
} from "@nodetool-ai/core-nodes";
import {
  TEXT_EXTRA_NODES as _TEXT_EXTRA_NODES,
  LIB_NLP_NODES as _LIB_NLP_NODES,
  LIB_MARKDOWN_NODES as _LIB_MARKDOWN_NODES,
  LIB_BEAUTIFULSOUP_NODES as _LIB_BEAUTIFULSOUP_NODES,
  LIB_SVG_NODES as _LIB_SVG_NODES
} from "@nodetool-ai/text-nodes";
import {
  AGENT_NODES as _AGENT_NODES,
  GEMINI_NODES as _GEMINI_NODES,
  OPENAI_NODES as _OPENAI_NODES,
  MISTRAL_NODES as _MISTRAL_NODES,
  GENERATOR_NODES as _GENERATOR_NODES,
  TEAM_NODES as _TEAM_NODES
} from "@nodetool-ai/llm-nodes";
import {
  DATA_NODES as _DATA_NODES,
  LIB_RSS_NODES as _LIB_RSS_NODES,
  LIB_SEABORN_NODES as _LIB_SEABORN_NODES
} from "@nodetool-ai/data-nodes";
import {
  DOCUMENT_NODES as _DOCUMENT_NODES,
  LIB_DOCX_NODES as _LIB_DOCX_NODES,
  LIB_EPUB_NODES as _LIB_EPUB_NODES,
  LIB_PPTX_NODES as _LIB_PPTX_NODES,
  LIB_PDF_NODES as _LIB_PDF_NODES,
  LIB_MARKITDOWN_NODES as _LIB_MARKITDOWN_NODES,
  LIB_PANDOC_NODES as _LIB_PANDOC_NODES
} from "@nodetool-ai/document-nodes";
import {
  IMAGE_NODES as _IMAGE_NODES,
  LIB_IMAGE_CHANNEL_NODES as _LIB_IMAGE_CHANNEL_NODES,
  LIB_IMAGE_COLOR_GRADING_NODES as _LIB_IMAGE_COLOR_GRADING_NODES,
  LIB_IMAGE_COLOR_NODES as _LIB_IMAGE_COLOR_NODES,
  LIB_IMAGE_DRAW_NODES as _LIB_IMAGE_DRAW_NODES,
  LIB_IMAGE_EFFECTS_NODES as _LIB_IMAGE_EFFECTS_NODES,
  LIB_IMAGE_ENHANCE_NODES as _LIB_IMAGE_ENHANCE_NODES,
  LIB_IMAGE_FILTER_EXTRAS_NODES as _LIB_IMAGE_FILTER_EXTRAS_NODES,
  LIB_IMAGE_FILTER_NODES as _LIB_IMAGE_FILTER_NODES,
  LIB_IMAGE_GENERATORS_NODES as _LIB_IMAGE_GENERATORS_NODES,
  LIB_IMAGE_KEYER_NODES as _LIB_IMAGE_KEYER_NODES,
  LIB_IMAGE_MASK_NODES as _LIB_IMAGE_MASK_NODES,
  LIB_IMAGE_WARP_NODES as _LIB_IMAGE_WARP_NODES,
  LIB_GRID_NODES as _LIB_GRID_NODES
} from "@nodetool-ai/image-nodes";
import {
  AUDIO_NODES as _AUDIO_NODES,
  LIB_AUDIO_DSP_NODES as _LIB_AUDIO_DSP_NODES,
  LIB_PEDALBOARD_EXTRA_NODES as _LIB_PEDALBOARD_EXTRA_NODES,
  OUTPUT_NODES as _OUTPUT_NODES
} from "@nodetool-ai/audio-nodes";
import {
  VIDEO_NODES as _VIDEO_NODES,
  LIB_YTDLP_NODES as _LIB_YTDLP_NODES,
  MODEL3D_NODES as _MODEL3D_NODES
} from "@nodetool-ai/video-nodes";
import {
  LIB_HTTP_NODES as _LIB_HTTP_NODES,
  LIB_GRAPHQL_NODES as _LIB_GRAPHQL_NODES,
  LIB_S3_NODES as _LIB_S3_NODES,
  LIB_SUPABASE_NODES as _LIB_SUPABASE_NODES,
  LIB_NOTION_NODES as _LIB_NOTION_NODES,
  LIB_TWILIO_NODES as _LIB_TWILIO_NODES,
  APIFY_NODES as _APIFY_NODES,
  LIB_MAIL_NODES as _LIB_MAIL_NODES,
  LIB_SECRET_NODES as _LIB_SECRET_NODES,
  MESSAGING_NODES as _MESSAGING_NODES,
  SEARCH_NODES as _SEARCH_NODES,
  KIE_DYNAMIC_NODES as _KIE_DYNAMIC_NODES
} from "@nodetool-ai/integration-nodes";
import {
  CODE_NODES as _CODE_NODES,
  CodeNode as _CodeNode,
  SANDBOX_NODES as _SANDBOX_NODES,
  TOOL_AGENT_NODES as _TOOL_AGENT_NODES
} from "@nodetool-ai/code-nodes";
import {
  LIB_BROWSER_NODES as _LIB_BROWSER_NODES,
  LIB_OS_NODES as _LIB_OS_NODES,
  WORKSPACE_NODES as _WORKSPACE_NODES,
  TRIGGER_NODES as _TRIGGER_NODES,
  LIB_SQLITE_NODES as _LIB_SQLITE_NODES,
  LIB_OCR_NODES as _LIB_OCR_NODES,
  LIB_EXCEL_NODES as _LIB_EXCEL_NODES,
  LIB_TENSORFLOW_NODES as _LIB_TENSORFLOW_NODES
} from "@nodetool-ai/automation-nodes";

/**
 * Every node class shipped by base-nodes' aggregate, flattened for
 * `registerBaseNodes`. Order is preserved from the pre-split barrel.
 */
export const ALL_BASE_NODES: readonly NodeClass[] = [
  ..._CONTROL_NODES,
  ..._LIST_NODES,
  ..._TEXT_EXTRA_NODES,
  ..._CONSTANT_NODES,
  ..._EXTENDED_PLACEHOLDER_NODES,
  ..._INPUT_NODES,
  ..._OUTPUT_NODES,
  ..._WORKFLOW_NODES,
  ..._SUBGRAPH_NODES,
  ..._WORKSPACE_NODES,
  ..._COMPARE_NODES,
  ..._DOCUMENT_NODES,
  ..._DATA_NODES,
  ..._CODE_NODES,
  _CodeNode,
  ..._LIB_DATETIME_NODES,
  ..._LIB_VALIDATE_NODES,
  ..._AUDIO_NODES,
  ..._TRIGGER_NODES,
  ..._IMAGE_NODES,
  ..._VIDEO_NODES,
  ..._AGENT_NODES,
  ..._GENERATOR_NODES,
  ..._MODEL3D_NODES,
  ..._LIB_OS_NODES,
  ..._LIB_MARKDOWN_NODES,
  ..._LIB_SECRET_NODES,
  ..._LIB_PANDOC_NODES,
  ..._LIB_YTDLP_NODES,
  ..._LIB_GRID_NODES,
  ..._LIB_SVG_NODES,
  ..._LIB_IMAGE_ENHANCE_NODES,
  ..._LIB_IMAGE_FILTER_NODES,
  ..._LIB_IMAGE_DRAW_NODES,
  ..._LIB_IMAGE_COLOR_GRADING_NODES,
  ..._LIB_RSS_NODES,
  ..._LIB_AUDIO_DSP_NODES,
  ..._LIB_SQLITE_NODES,
  ..._LIB_SUPABASE_NODES,
  ..._LIB_S3_NODES,
  ..._LIB_EXCEL_NODES,
  ..._LIB_DOCX_NODES,
  ..._LIB_BEAUTIFULSOUP_NODES,
  ..._LIB_BROWSER_NODES,
  ..._LIB_HTTP_NODES,
  ..._LIB_GRAPHQL_NODES,
  ..._LIB_MAIL_NODES,
  ..._LIB_TWILIO_NODES,
  ..._LIB_MARKITDOWN_NODES,
  ..._LIB_SEABORN_NODES,
  ..._LIB_PEDALBOARD_EXTRA_NODES,
  ..._LIB_PDF_NODES,
  ..._LIB_EPUB_NODES,
  ..._LIB_PPTX_NODES,
  ..._LIB_OCR_NODES,
  ..._LIB_TENSORFLOW_NODES,
  ..._LIB_NOTION_NODES,
  ..._KIE_DYNAMIC_NODES,
  ..._VECTOR_NODES,
  ..._GEMINI_NODES,
  ..._APIFY_NODES,
  ..._MESSAGING_NODES,
  ..._MISTRAL_NODES,
  ..._OPENAI_NODES,
  ..._SEARCH_NODES,
  ..._TOOL_AGENT_NODES,
  ..._SANDBOX_NODES,
  ..._TEAM_NODES,
  ..._LIB_NLP_NODES,
  ..._LIB_IMAGE_EFFECTS_NODES,
  ..._LIB_IMAGE_KEYER_NODES,
  ..._LIB_IMAGE_MASK_NODES,
  ..._LIB_IMAGE_CHANNEL_NODES,
  ..._LIB_IMAGE_WARP_NODES,
  ..._LIB_IMAGE_GENERATORS_NODES,
  ..._LIB_IMAGE_FILTER_EXTRAS_NODES,
  ..._LIB_IMAGE_COLOR_NODES
];

/**
 * Register every base node into the given registry, with metadata
 * overrides for the three workflow-execution nodes (Preview, Workflow,
 * Subgraph) that the runtime injects dynamically.
 */
export function registerBaseNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_BASE_NODES) {
    if (nodeClass.nodeType === "nodetool.workflows.base_node.Preview") {
      registry.register(nodeClass, {
        metadata: {
          title: "Preview",
          description: "Preview values inside the workflow graph",
          namespace: "nodetool.workflows.base_node",
          node_type: "nodetool.workflows.base_node.Preview",
          properties: [
            {
              name: "value",
              type: { type: "any", type_args: [] },
              default: null
            },
            { name: "name", type: { type: "str", type_args: [] }, default: "" }
          ],
          outputs: [{ name: "output", type: { type: "any", type_args: [] } }],
          inline_fields: ["value", "name"]
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.workflow_node.Workflow") {
      registry.register(nodeClass, {
        metadata: {
          title: "Workflow",
          description:
            "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.",
          namespace: "nodetool.workflows.workflow_node",
          node_type: "nodetool.workflows.workflow_node.Workflow",
          is_dynamic: true,
          is_streaming_output: true,
          properties: [
            {
              name: "workflow_id",
              type: { type: "str", type_args: [] },
              default: ""
            },
            {
              name: "workflow_json",
              type: { type: "dict", type_args: [] },
              default: {}
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.subgraph.Subgraph") {
      registry.register(nodeClass, {
        metadata: {
          title: "Subgraph",
          description:
            "Execute an inline sub-graph as an isolated workflow. Inputs/outputs are derived from inner Input/Output nodes.",
          namespace: "nodetool.workflows.subgraph",
          node_type: "nodetool.workflows.subgraph.Subgraph",
          is_dynamic: true,
          is_streaming_output: true,
          properties: [
            {
              name: "graph",
              type: { type: "dict", type_args: [] },
              default: { nodes: [], edges: [] }
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
