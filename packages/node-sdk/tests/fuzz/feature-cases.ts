/**
 * Graphs and a registry for the validator branches the plain seed registry
 * cannot reach: model catalogs, required model inputs, credentials, choice
 * values, catalog packs and linked scripts. The registry here declares those
 * features and the graphs use them, so the mutation operators in `corpus.ts`
 * run against real branches rather than the `unknown` path.
 */

import type { NodeMetadata } from "../../src/metadata.js";
import type { GraphValidationRegistry } from "../../src/graph-validation.js";
import type { JsScriptLinkLookup } from "../../src/js-script-link.js";
import type { SeedGraph } from "./seeds.js";

const LLM = (provider: string | undefined, id: string | undefined) => ({
  type: "language_model",
  ...(provider === undefined ? {} : { provider }),
  ...(id === undefined ? {} : { id })
});

const MODEL_CATALOG: Record<string, readonly string[] | undefined> = {
  "openai:language_model": [
    "gpt-5",
    "gpt-5-mini",
    "gpt-4o",
    "gpt-4",
    "gpt-4o-long-name",
    "o3"
  ],
  "openai:image_model": [],
  "openai:asr_model": ["gpt", "zzz"],
  "openai:tts_model": ["zzz"]
};

const REQUIRED_INPUTS: Record<string, readonly string[]> = {
  "gpt-5-mini": [
    "prompt",
    "prompt",
    "negative",
    "tags",
    "count",
    "opts",
    "absent",
    "wired",
    "undeclared"
  ]
};

function prop(
  name: string,
  type: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return { name, type: { type }, ...extra };
}

const META: Record<string, Partial<NodeMetadata>> = {
  "feat.Media": {
    required_settings: ["FEAT_KEY", "", "FEAT_KEY", "OTHER_KEY"],
    properties: [
      prop("prompt", "str"),
      prop("negative", "str"),
      prop("tags", "list"),
      prop("count", "int"),
      prop("opts", "dict"),
      prop("wired", "str"),
      prop("absent", "str"),
      prop("model", "language_model"),
      prop("models", "list"),
      prop("config", "dict"),
      prop("mode", "str", { values: ["fast", "slow"] }),
      prop("level", "int", { type: { type: "int", values: [1, 2] } }),
      prop("strength", "float", {
        type: { type: "float", values: [0.1, 0.5] }
      }),
      prop("flag", "bool"),
      prop("empty", "str", { values: [] })
    ] as never,
    outputs: [{ name: "output", type: { type: "str" } }] as never
  },
  "feat.Dyn": {
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true,
    properties: [prop("a", "str")] as never,
    outputs: [{ name: "output", type: { type: "str" } }] as never
  },
  "feat.Listy": {
    properties: [prop("items", "list[str]"), prop("single", "str")] as never,
    outputs: [{ name: "output", type: { type: "str" } }] as never
  },
  "nodetool.code.Code": {
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true,
    properties: [
      prop("code", "str"),
      prop("packages", "list"),
      prop("secrets", "list"),
      prop("script", "dict")
    ] as never,
    outputs: [] as never
  },
  "nodetool.control.Loop": {
    properties: [prop("next", "str"), prop("condition", "bool")] as never,
    outputs: [{ name: "output", type: { type: "str" } }] as never
  },
  "nodetool.workflows.base_node.Comment": {
    properties: [] as never,
    outputs: [] as never
  }
};

const CATALOG_ENTRIES: Record<string, { pack: string } | undefined> = {
  "pack.WithEntry": { pack: "feat-pack" },
  "pack.NoEntry": undefined
};

export interface FeatureRegistryOptions {
  /** Drop every optional registry method, as a browser caller would. */
  bare?: boolean;
  providers?: readonly string[];
  /** Leave `listRequiredTextInputs` out while keeping the model catalog. */
  noRequiredInputs?: boolean;
}

export function featureRegistry(
  options: FeatureRegistryOptions = {}
): GraphValidationRegistry {
  const metas = new Map<string, NodeMetadata>();
  for (const [type, partial] of Object.entries(META)) {
    metas.set(type, {
      title: type,
      description: "",
      namespace: type.split(".").slice(0, -1).join("."),
      node_type: type,
      properties: [],
      outputs: [],
      ...partial
    } as unknown as NodeMetadata);
  }
  const base: GraphValidationRegistry = {
    has: (type) => metas.has(type),
    getMetadata: (type) => metas.get(type),
    validateNode: () => []
  };
  if (options.bare) {
    return base;
  }
  return {
    ...base,
    availability: (type) =>
      type in CATALOG_ENTRIES
        ? "catalog"
        : metas.has(type)
          ? "executable"
          : "unknown",
    catalogEntry: (type) => CATALOG_ENTRIES[type] as never,
    catalogPack: (type) =>
      type === "pack.WithEntry"
        ? ({ installBytes: 42, installCommand: "npm i feat-pack" } as never)
        : undefined,
    listProviderIds: () => options.providers ?? ["openai", "anthropic"],
    listModelIds: (provider, kind) => MODEL_CATALOG[`${provider}:${kind}`],
    ...(options.noRequiredInputs
      ? {}
      : {
          listRequiredTextInputs: (_provider, _kind, id) => REQUIRED_INPUTS[id]
        })
  };
}

const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({ id, type, properties, ...extra });

const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  extra: Record<string, unknown> = {}
) => ({ id, source, sourceHandle, target, targetHandle, ...extra });

export const FEATURE_GRAPHS: readonly SeedGraph[] = [
  {
    id: "model-selection",
    graph: {
      nodes: [
        node("ok", "feat.Media", { model: LLM("openai", "gpt-5") }),
        // Near misses: same-length ties, a prefix of exactly three characters.
        node("near", "feat.Media", { model: LLM("openai", "gpt-6") }),
        node("asr", "feat.Media", {
          model: { type: "asr_model", provider: "openai", id: "gpt-9" }
        }),
        node("tts", "feat.Media", {
          model: { type: "tts_model", provider: "openai", id: "nothing" }
        }),
        node("img", "feat.Media", {
          model: { type: "image_model", provider: "openai", id: "anything" }
        }),
        node("online", "feat.Media", {
          model: LLM("anthropic", "claude-whatever")
        }),
        node("noProvider", "feat.Media", { model: LLM(undefined, "gpt-5") }),
        node("noId", "feat.Media", { model: LLM("openai", undefined) }),
        node("empty", "feat.Media", { model: LLM("", "") }),
        node("badProvider", "feat.Media", { model: LLM("nope", "gpt-5") }),
        node("listed", "feat.Media", {
          models: [LLM("openai", "gpt-5"), LLM("openai", "o4")]
        }),
        node("nested", "feat.Media", {
          config: { inner: { model: LLM("openai", "gpt-4x") } }
        }),
        node("tooDeep", "feat.Media", {
          config: { a: { b: { c: { d: { model: LLM("nope", "x") } } } } }
        }),
        node("listDeep", "feat.Media", {
          models: [[[[[LLM("nope", "x")]]]]]
        }),
        node(
          "dyn",
          "feat.Dyn",
          {},
          {
            dynamic_properties: { extra: LLM("nope", "x") }
          }
        ),
        node("notModel", "feat.Media", {
          config: { type: "language", provider: "nope", id: "x" },
          prompt: [null, 3, "text"]
        })
      ],
      edges: [
        edge("w1", "ok", "output", "wiredModel", "model"),
        edge("w2", "ok", "output", "dyn", "extra")
      ]
    }
  },
  {
    id: "required-model-inputs",
    graph: {
      nodes: [
        node("src", "feat.Media", { model: LLM("openai", "gpt-5") }),
        node("blank", "feat.Media", {
          model: LLM("openai", "gpt-5-mini"),
          prompt: "",
          negative: "   ",
          tags: [],
          count: 0,
          opts: {},
          wired: ""
        }),
        node("filled", "feat.Media", {
          model: LLM("openai", "gpt-5-mini"),
          prompt: "x",
          negative: "y",
          tags: [1],
          count: 1,
          opts: { a: 1 },
          absent: "z",
          wired: "w"
        }),
        node("nullish", "feat.Media", {
          model: LLM("openai", "gpt-5-mini"),
          prompt: null,
          negative: false
        }),
        node("nestedOnly", "feat.Media", {
          config: { model: LLM("openai", "gpt-5-mini") },
          models: [LLM("openai", "gpt-5-mini")]
        }),
        node("noProviderRef", "feat.Media", {
          model: LLM(undefined, "gpt-5-mini")
        }),
        node("noIdRef", "feat.Media", { model: LLM("openai", undefined) }),
        node("undeclaredHost", "feat.Dyn", {
          model: LLM("openai", "gpt-5-mini")
        })
      ],
      edges: [edge("r1", "src", "output", "blank", "wired")]
    }
  },
  {
    id: "choices-and-properties",
    graph: {
      nodes: [
        node("bad", "feat.Media", {
          mode: "medium",
          level: 3,
          strength: 0.3,
          flag: "text"
        }),
        node("good", "feat.Media", { mode: "fast", level: "2", strength: 0.1 }),
        node("typed", "feat.Media", { mode: 7, level: 1, empty: "anything" }),
        node("odd", "feat.Media", { mode: null, level: {}, strength: 0.9 }),
        node("wiredChoice", "feat.Media", { mode: "medium" }),
        node("src", "feat.Media", {}),
        node("misspelled", "feat.Media", {
          promt: "x",
          nmae: "y",
          mode: "fast"
        }),
        node("misspelledOne", "feat.Media", { promt: "x" }),
        node("dynamicOk", "feat.Dyn", { anything: 1 }),
        node(
          "dynamicOwn",
          "feat.Dyn",
          { a: "x", declared: 1 },
          {
            dynamic_properties: { declared: 1 }
          }
        ),
        node("reserved", "feat.Media", { __internal__: 1 }),
        node("handleLeft", "feat.Media", {
          prompt: { __handle: true, source: "src", sourceHandle: "output" },
          tags: [{ __handle: true }, { __handle: false }],
          config: {
            nested: { __handle: true },
            deep: { a: { b: { c: { d: { __handle: true } } } } }
          },
          negative: { __handle: "yes" }
        }),
        node(
          "aliases",
          "feat.Dyn",
          {},
          {
            dynamic_inputs: { x: { type: { type: "string" } } },
            dynamic_outputs: { y: { type: "integer" } }
          }
        )
      ],
      edges: [edge("c1", "src", "output", "wiredChoice", "mode")]
    }
  },
  {
    id: "credentials",
    graph: {
      nodes: [
        node("needs", "feat.Media", {}),
        node("again", "feat.Media", {}),
        node("plain", "feat.Listy", {}),
        node("missingType", "", {}),
        node("code", "nodetool.code.Code", {
          code: "return {};",
          secrets: ["SECRET_A", "", 4, "SECRET_A", "FEAT_KEY"]
        }),
        node("codeNoSecrets", "nodetool.code.Code", {
          code: "return {};",
          secrets: "SECRET_A"
        }),
        node("packed", "pack.WithEntry", {}),
        node("packedBare", "pack.NoEntry", {}),
        node("comment", "nodetool.workflows.base_node.Comment", {}),
        node("fakeComment", "nodetool.workflows.base_node.Other", {}),
        node("shortComment", "Comment", {}),
        node("ghost", "does.Not.Exist", {})
      ],
      edges: []
    }
  },
  {
    id: "handles-and-fan-in",
    graph: {
      nodes: [
        node("s1", "feat.Media", {}),
        node("s2", "feat.Media", {}),
        node(
          "s3",
          "feat.Dyn",
          {},
          {
            dynamic_outputs: { named: { type: "str" } }
          }
        ),
        node("list", "feat.Listy", {}),
        node("scalar", "feat.Listy", {}),
        node(
          "dynList",
          "feat.Dyn",
          {},
          {
            dynamic_inputs: { many: { type: { type: "list", type_args: [] } } }
          }
        ),
        node(
          "dynScalar",
          "feat.Dyn",
          {},
          {
            dynamic_inputs: { one: { type: { type: "str" } } }
          }
        ),
        node("dynUnknown", "feat.Dyn", {}),
        node("loop", "nodetool.control.Loop", {}),
        node("loopBody", "feat.Media", {})
      ],
      edges: [
        edge("f1", "s1", "output", "list", "items"),
        edge("f2", "s2", "output", "list", "items"),
        edge("f3", "s1", "output", "scalar", "single"),
        edge("f4", "s2", "output", "scalar", "single"),
        edge("f5", "s1", "output", "dynList", "many"),
        edge("f6", "s2", "output", "dynList", "many"),
        edge("f7", "s1", "output", "dynScalar", "one"),
        edge("f8", "s2", "output", "dynScalar", "one"),
        edge("f9", "s1", "output", "dynUnknown", "free"),
        edge("f10", "s2", "output", "dynUnknown", "free"),
        edge("f11", "s1", "output", "scalar", "single", {
          edge_type: "control"
        }),
        edge("f12", "s3", "named", "list", "items"),
        edge("f13", "s3", "missing", "list", "single"),
        edge("f14", "s1", "nothing", "list", "single"),
        edge("f15", "s1", "output", "list", "nothing"),
        edge("f16", "s1", "output", "loop", "next"),
        edge("f17", "loop", "output", "loopBody", "prompt"),
        edge("f18", "loopBody", "output", "loop", "next"),
        edge("f19", "loopBody", "output", "loop", "condition"),
        edge("f20", "s1", "__control__", "s2", "__control__"),
        edge("f21", "", "output", "s2", "prompt"),
        edge("f22", "s1", "", "s2", "prompt"),
        edge("f23", "s1", "output", "s2", "")
      ]
    }
  },
  {
    id: "linked-scripts",
    graph: {
      nodes: [
        node(
          "linked",
          "nodetool.code.Code",
          {
            code: "return { out: 1 };",
            script: { id: "script-1", version: 2 }
          },
          {
            dynamic_inputs: { text: { type: { type: "str" } } },
            dynamic_outputs: { out: { type: { type: "int" } } }
          }
        ),
        node(
          "drifted",
          "nodetool.code.Code",
          { code: "return {};", script: { id: "script-1", version: 2 } },
          { dynamic_inputs: { extra: { type: { type: "str" } } } }
        ),
        node(
          "gone",
          "nodetool.code.Code",
          { code: "return {};", script: { id: "script-gone", version: 1 } },
          {}
        ),
        node("unlinked", "nodetool.code.Code", {
          code: "return {};",
          script: {}
        }),
        node("wiredCode", "nodetool.code.Code", { code: "return {};" }),
        node("src", "feat.Media", {}),
        node("sink", "feat.Media", {})
      ],
      edges: [
        edge("l1", "src", "output", "linked", "text"),
        edge("l2", "src", "output", "wiredCode", "code"),
        edge("l3", "linked", "out", "sink", "prompt"),
        edge("l4", "linked", "__output__", "sink", "negative")
      ]
    }
  }
];

/** A lookup that knows one script, so the other links resolve to nothing. */
export const SCRIPT_LOOKUP: JsScriptLinkLookup = (link) =>
  link.id === "script-1"
    ? {
        id: link.id,
        name: "script",
        version: link.version,
        document: {
          inputs: [{ name: "text" }],
          outputs: [{ name: "out" }]
        } as never
      }
    : undefined;
