import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import { ExecutionSession } from "@nodetool-ai/execution";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import {
  FakeProvider,
  createFakeContext,
  type FakeContextHandle
} from "@nodetool-ai/runtime";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base"
);

const FILES = {
  directions: "Propose Three Campaign Directions.json",
  hero: "Render a Directed Campaign Hero.json",
  layouts: "Compose Directed Campaign Formats.json",
  revision: "Revise an Accepted Campaign Hero.json",
  restore: "Reopen a Directed Campaign.json"
} as const;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const DIRECTIONS = {
  directions: [
    {
      id: "A",
      title: "Quiet monument",
      setting: "Pale architectural stone",
      composition: "Cup left with copy space right",
      lighting: "Last light from camera right",
      palette: "Olive, slate, and warm limestone",
      preservationInstructions: "Keep cup geometry, lid, logo, and finish"
    },
    {
      id: "B",
      title: "Long way home",
      setting: "An open stone terrace",
      composition: "Low camera with centered cup and open sky",
      lighting: "Low amber horizon light",
      palette: "Olive, pale stone, and muted amber",
      preservationInstructions: "Keep product identity and camera height"
    },
    {
      id: "C",
      title: "Weekend threshold",
      setting: "A minimal trailhead shelter",
      composition: "Cup foreground with contained distant landscape",
      lighting: "Soft directional dusk",
      palette: "Olive, dark slate, and cool sky",
      preservationInstructions: "Keep shape, branding, color, and surface"
    }
  ]
};

interface WorkflowNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  dynamic_outputs?: Record<string, unknown>;
}

interface WorkflowDocument {
  id: string;
  name: string;
  description: string;
  graph: {
    nodes: WorkflowNode[];
    edges: Array<Record<string, unknown>>;
  };
}

function load(file: string): WorkflowDocument {
  return JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as WorkflowDocument;
}

function codeFor(file: string, nodeId: string): string {
  const node = load(file).graph.nodes.find(
    (candidate) => candidate.id === nodeId
  );
  if (!node || typeof node.data?.code !== "string") {
    throw new Error(`${file} does not contain Code node ${nodeId}`);
  }
  return node.data.code;
}

function imageRef(
  bytes: Uint8Array,
  width = 1,
  height = 1,
  mimeType = "image/png"
): Record<string, unknown> {
  return {
    type: "image",
    data: Buffer.from(bytes).toString("base64"),
    mimeType,
    width,
    height
  };
}

function documentRef(text: string): Record<string, unknown> {
  return {
    type: "document",
    data: Buffer.from(text).toString("base64"),
    mimeType: "application/json"
  };
}

async function documentText(
  fake: FakeContextHandle,
  value: unknown
): Promise<string> {
  const ref = value as { data?: unknown; uri?: unknown };
  if (typeof ref.data === "string") {
    return Buffer.from(ref.data, "base64").toString("utf8");
  }
  if (typeof ref.uri !== "string" || ref.uri.length === 0) {
    throw new Error("Expected a readable document ref");
  }
  const { bytes } = await fake.context.resolveAssetBytes(ref.uri);
  if (!bytes) {
    throw new Error(`Could not resolve document ref ${ref.uri}`);
  }
  return Buffer.from(bytes).toString("utf8");
}

function injectFakeModels(workflow: WorkflowDocument): WorkflowDocument {
  const copy = structuredClone(workflow);
  for (const node of copy.graph.nodes) {
    if (!node.data) continue;
    if (node.id === "direction-agent") {
      node.data.model = {
        type: "language_model",
        provider: "openai",
        id: "gpt-5-mini",
        name: "GPT-5 mini"
      };
    }
    if (node.id === "hero-edit" || node.id === "revision-edit") {
      node.data.model = {
        type: "image_model",
        provider: "openai",
        id: "gpt-image-1",
        name: "GPT Image 1",
        path: ""
      };
    }
  }
  return copy;
}

async function runWorkflow(
  file: string,
  params: Record<string, unknown>,
  provider = new FakeProvider()
): Promise<{
  result: Awaited<ReturnType<typeof resultOf>>;
  fake: FakeContextHandle;
  provider: FakeProvider;
}> {
  const workflow = injectFakeModels(load(file));
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const fake = createFakeContext({
    providers: { openai: provider },
    jobId: `directed-campaign-${workflow.id}`
  });
  const session = await ExecutionSession.create({
    graph: workflow.graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    bridgeFactory: async () => null,
    context: fake.context,
    jobId: `directed-campaign-${workflow.id}`,
    requireTerminalResult: true,
    params
  });
  const result = await session.result;
  return { result, fake, provider };
}

async function resultOf(session: ExecutionSession) {
  return session.result;
}

function one(
  result: Awaited<ReturnType<typeof resultOf>>,
  name: string
): unknown {
  const values = result.outputs?.[name] ?? result.outputs?.[`out-${name}`];
  expect(values, `missing output ${name}`).toHaveLength(1);
  return values?.[0];
}

function oneString(
  result: Awaited<ReturnType<typeof resultOf>>,
  name: string
): string {
  const value = one(result, name);
  expect(typeof value).toBe("string");
  return String(value);
}

async function runCode(
  file: string,
  nodeId: string,
  inputs: Record<string, unknown>,
  fake?: FakeContextHandle
): Promise<Record<string, unknown>> {
  const ownFake = fake ?? createFakeContext({ jobId: `${nodeId}-test` });
  try {
    const node = new CodeNode({ code: codeFor(file, nodeId), ...inputs });
    return await node.process(ownFake.context);
  } finally {
    if (!fake) ownFake.cleanup();
  }
}

function acceptedContract(
  headline = "Take the long way home.",
  cta = "Meet Olive"
): Record<string, unknown> {
  const brief = {
    productName: "Olive Travel Cup",
    campaignMessage: "Take everyday travel beyond the direct route.",
    audience: "Commuters who spend weekends outdoors",
    headline,
    cta,
    referenceRole: "lighting",
    referenceUse: "Use the low angle of the light",
    referenceIgnore: "Ignore the depicted objects"
  };
  return {
    schemaVersion: 1,
    kind: "hero",
    brief,
    selectedDirection: DIRECTIONS.directions[1],
    copy: { productName: brief.productName, headline, cta },
    sourceOrder: ["product identity", "optional lighting reference"],
    render: { aspectRatio: "16:9", resolution: "1K", prompt: "captured" }
  };
}

describe("Directed Campaign Kit workflow contracts", () => {
  it("ships exact graph interfaces and valid default model references", () => {
    const expected = [
      [
        FILES.directions,
        "Propose Three Campaign Directions",
        [
          "product_image",
          "product_name",
          "campaign_message",
          "audience",
          "headline",
          "cta",
          "reference_image",
          "reference_role",
          "reference_use",
          "reference_ignore"
        ],
        ["directions", "plan", "phase"]
      ],
      [
        FILES.hero,
        "Render a Directed Campaign Hero",
        ["plan", "choice"],
        ["hero", "contract", "phase"]
      ],
      [
        FILES.layouts,
        "Compose Directed Campaign Formats",
        ["hero", "contract", "version", "original_record"],
        [
          "hero",
          "portrait",
          "story",
          "portrait_svg",
          "story_svg",
          "contract",
          "record",
          "record_file",
          "phase"
        ]
      ],
      [
        FILES.revision,
        "Revise an Accepted Campaign Hero",
        ["hero", "contract", "change", "preserve", "allow"],
        ["hero", "contract", "phase"]
      ],
      [
        FILES.restore,
        "Reopen a Directed Campaign",
        ["record_file"],
        [
          "accepted_hero",
          "accepted_contract",
          "original_portrait",
          "original_story",
          "original_portrait_svg",
          "original_story_svg",
          "original_record",
          "revised_hero",
          "revised_contract",
          "revised_portrait",
          "revised_story",
          "revised_portrait_svg",
          "revised_story_svg",
          "record_file",
          "phase"
        ]
      ]
    ] as const;

    for (const [file, name, inputNames, outputNames] of expected) {
      const workflow = load(file);
      expect(workflow.name).toBe(name);
      const nodes = workflow.graph.nodes;
      expect(
        nodes
          .filter((node) => node.type.startsWith("nodetool.input."))
          .map((node) => node.data?.name)
      ).toEqual(inputNames);
      expect(
        nodes
          .filter((node) => node.type === "nodetool.output.Output")
          .map((node) => node.data?.name)
      ).toEqual(outputNames);
      for (const inputName of inputNames) {
        expect(nodes.some((node) => node.id === `in-${inputName}`)).toBe(true);
      }
      for (const outputName of outputNames) {
        expect(nodes.some((node) => node.id === `out-${outputName}`)).toBe(
          true
        );
      }
      for (const node of nodes) {
        const model = node.data?.model;
        if (!model || typeof model !== "object") continue;
        expect(String((model as { id?: unknown }).id)).not.toBe("");
        expect(String((model as { provider?: unknown }).provider)).not.toBe("");
        expect(String((model as { name?: unknown }).name)).not.toBe("");
      }
    }

    expect(
      load(FILES.layouts).graph.nodes.find(
        (node) => node.id === "in-original_record"
      )?.type
    ).toBe("nodetool.input.DocumentInput");
  });

  it("validates three directions and rejects malformed model JSON", async () => {
    const brief = JSON.stringify({
      schemaVersion: 1,
      productName: "Olive Travel Cup",
      campaignMessage: "A cup for the long route",
      audience: "Outdoor commuters",
      headline: "Take the long way home.",
      cta: "Meet Olive",
      productImage: imageRef(Uint8Array.of(1)),
      referenceImage: null,
      referenceRole: "none",
      referenceUse: "",
      referenceIgnore: ""
    });
    const parsed = await runCode(FILES.directions, "direction-parser", {
      response: JSON.stringify(DIRECTIONS),
      brief
    });
    expect(parsed.phase).toBe("directions_ready");
    expect(String(parsed.directions)).toContain("### B — Long way home");
    expect(JSON.parse(String(parsed.plan))).toMatchObject({
      schemaVersion: 1,
      directions: [{ id: "A" }, { id: "B" }, { id: "C" }]
    });

    await expect(
      runCode(FILES.directions, "direction-parser", {
        response: "not json",
        brief
      })
    ).rejects.toThrow(/malformed JSON/);
  });

  it("rejects a wrong reference role and missing product before a paid call", async () => {
    const provider = new FakeProvider({
      textResponse: JSON.stringify(DIRECTIONS),
      shouldStream: false
    });
    const common = {
      product_name: "Olive Travel Cup",
      campaign_message: "Take everyday travel beyond the direct route.",
      audience: "Outdoor commuters",
      headline: "Take the long way home.",
      cta: "Meet Olive",
      reference_image: imageRef(Uint8Array.of(9)),
      reference_use: "Use the light",
      reference_ignore: "Ignore objects"
    };

    const wrongRole = await runWorkflow(
      FILES.directions,
      {
        ...common,
        product_image: imageRef(Uint8Array.of(1)),
        reference_role: "mood"
      },
      provider
    );
    try {
      expect(wrongRole.result.status).toBe("failed");
      expect(wrongRole.result.error).toMatch(/Reference role/);
      expect(provider.callCount).toBe(0);
    } finally {
      wrongRole.fake.cleanup();
    }

    const missing = await runWorkflow(
      FILES.directions,
      {
        ...common,
        product_image: { type: "image", uri: "" },
        reference_role: "none"
      },
      provider
    );
    try {
      expect(missing.result.status).toBe("failed");
      expect(provider.callCount).toBe(0);
    } finally {
      missing.fake.cleanup();
    }
  });

  it("orders product first, captures choice B, and revises only the accepted hero", async () => {
    const product = imageRef(Uint8Array.of(1, 2, 3));
    const reference = imageRef(Uint8Array.of(7, 8, 9));
    const prepared = await runCode(FILES.directions, "direction-brief", {
      product_image: product,
      product_name: "Olive Travel Cup",
      campaign_message: "Take everyday travel beyond the direct route.",
      audience: "Outdoor commuters",
      headline: "Take the long way home.",
      cta: "Meet Olive",
      reference_image: reference,
      reference_role: "lighting",
      reference_use: "Use the low angle",
      reference_ignore: "Ignore the other product"
    });
    expect(prepared.images).toEqual([product, reference]);
    expect(String(prepared.prompt)).toContain(
      "Image 1 is always the product identity"
    );
    expect(String(prepared.prompt)).toContain(
      "Image 2 has the single role 'lighting'"
    );

    const parsed = await runCode(FILES.directions, "direction-parser", {
      response: JSON.stringify(DIRECTIONS),
      brief: prepared.brief
    });
    const heroPrepared = await runCode(FILES.hero, "hero-prepare", {
      plan: parsed.plan,
      choice: "B"
    });
    const heroContract = JSON.parse(String(heroPrepared.contract));
    expect(heroPrepared.images).toEqual([product, reference]);
    expect(heroContract.selectedDirection).toEqual(DIRECTIONS.directions[1]);
    expect(heroContract.copy).toEqual({
      productName: "Olive Travel Cup",
      headline: "Take the long way home.",
      cta: "Meet Olive"
    });

    const acceptedHero = imageRef(Uint8Array.of(30, 31, 32));
    const revision = await runCode(FILES.revision, "revision-prepare", {
      hero: acceptedHero,
      contract: JSON.stringify(heroContract),
      change: "Move the scene from late afternoon to blue hour.",
      preserve:
        "Keep the cup, camera, surface, composition, headline, CTA, and spacing.",
      allow: "Let reflections, shadows, and sky respond."
    });
    const revisedContract = JSON.parse(String(revision.contract));
    expect(revision.images).toEqual([acceptedHero]);
    expect(revisedContract.parentContract).toEqual(heroContract);
    expect(revisedContract.revisionRequest).toEqual({
      change: "Move the scene from late afternoon to blue hour.",
      preserve:
        "Keep the cup, camera, surface, composition, headline, CTA, and spacing.",
      allow: "Let reflections, shadows, and sky respond."
    });
  });

  it("executes deterministic layouts, escapes exact copy, preserves original artifacts, and restores the portable record", async () => {
    const specialHeadline = 'Olive & Co. says "go" <outside>\nDéjà vu home.';
    const specialCta = "Meet Olive & roam";
    const originalContract = acceptedContract(specialHeadline, specialCta);
    const originalHero = imageRef(TINY_PNG);
    const originalRun = await runWorkflow(FILES.layouts, {
      hero: originalHero,
      contract: JSON.stringify(originalContract),
      version: "original"
    });
    let originalRecordText: string;
    try {
      expect(originalRun.result.status, originalRun.result.error).toBe(
        "completed"
      );
      expect(oneString(originalRun.result, "phase")).toBe("campaign_ready");
      expect(JSON.parse(oneString(originalRun.result, "record"))).toEqual({
        schemaVersion: 1,
        acceptedVersion: "original",
        productName: "Olive Travel Cup",
        headline: specialHeadline,
        cta: specialCta,
        hasRevision: false,
        portableRecord: "record_file"
      });
      originalRecordText = await documentText(
        originalRun.fake,
        one(originalRun.result, "record_file")
      );
    } finally {
      originalRun.fake.cleanup();
    }

    const originalRecord = JSON.parse(originalRecordText);
    expect(originalRecord.original.portrait).toMatchObject({
      mimeType: "image/png",
      width: 1080,
      height: 1350
    });
    expect(originalRecord.original.story).toMatchObject({
      mimeType: "image/png",
      width: 1080,
      height: 1920
    });
    const portraitSvg = Buffer.from(
      originalRecord.original.portraitSvg.data,
      "base64"
    ).toString("utf8");
    expect(portraitSvg).toContain("data:image/png;base64,");
    expect(portraitSvg).toContain('Olive &amp; Co. says "go" ');
    expect(portraitSvg).toContain("&lt;outside&gt;");
    expect(portraitSvg).toContain("Déjà vu home.");
    expect(portraitSvg).toContain("Meet Olive &amp; roam");
    expect(portraitSvg).toContain(
      "System font fallback: Arial, Helvetica, sans-serif"
    );

    const revisionPrepared = await runCode(FILES.revision, "revision-prepare", {
      hero: originalHero,
      contract: JSON.stringify(originalContract),
      change: "Move the scene from late afternoon to blue hour.",
      preserve: "Keep product geometry and composition.",
      allow: "Let shadows respond."
    });
    const revisedHero = imageRef(TINY_PNG);
    const revisionRun = await runWorkflow(FILES.layouts, {
      hero: revisedHero,
      contract: revisionPrepared.contract,
      version: "revision",
      original_record: documentRef(originalRecordText)
    });
    let combinedRecordText: string;
    try {
      expect(revisionRun.result.status, revisionRun.result.error).toBe(
        "completed"
      );
      expect(oneString(revisionRun.result, "phase")).toBe("complete");
      expect(JSON.parse(oneString(revisionRun.result, "record"))).toMatchObject(
        {
          schemaVersion: 1,
          acceptedVersion: "revision",
          hasRevision: true,
          portableRecord: "record_file"
        }
      );
      combinedRecordText = await documentText(
        revisionRun.fake,
        one(revisionRun.result, "record_file")
      );
    } finally {
      revisionRun.fake.cleanup();
    }

    const combined = JSON.parse(combinedRecordText);
    expect(combined.original).toEqual(originalRecord.original);
    expect(combined.acceptedVersion).toBe("revision");
    expect(combined.revision.contract.parentContract).toEqual(originalContract);

    const restored = await runWorkflow(FILES.restore, {
      record_file: documentRef(combinedRecordText)
    });
    try {
      expect(restored.result.status, restored.result.error).toBe("completed");
      expect(oneString(restored.result, "phase")).toBe("complete");
      expect(
        JSON.parse(oneString(restored.result, "accepted_contract"))
      ).toEqual(originalContract);
      expect(
        JSON.parse(oneString(restored.result, "revised_contract"))
      ).toEqual(combined.revision.contract);
      expect(JSON.parse(oneString(restored.result, "original_record"))).toEqual(
        {
          schemaVersion: 1,
          acceptedVersion: "original",
          productName: "Olive Travel Cup",
          headline: specialHeadline,
          cta: specialCta,
          hasRevision: false,
          portableRecord: "record_file"
        }
      );
      expect(restored.provider.callCount).toBe(0);
    } finally {
      restored.fake.cleanup();
    }
  }, 60_000);

  it("rejects copy overflow and a non-canonical revision ancestry", async () => {
    const contract = acceptedContract("x".repeat(31));
    await expect(
      runCode(FILES.layouts, "layout-elements", {
        hero: imageRef(TINY_PNG),
        contract: JSON.stringify(contract),
        version: "original"
      })
    ).rejects.toThrow(/word longer than 30/);

    const valid = {
      schemaVersion: 1,
      brief: (contract as { brief: unknown }).brief,
      references: { role: "lighting", use: "low light", ignore: "objects" },
      selectedDirection: DIRECTIONS.directions[1],
      approvedCopy: (contract as { copy: unknown }).copy,
      acceptedVersion: "revision",
      original: {
        source: {
          mimeType: "image/png",
          width: 1,
          height: 1,
          data: TINY_PNG.toString("base64")
        },
        portrait: {
          mimeType: "image/png",
          width: 1080,
          height: 1350,
          data: TINY_PNG.toString("base64")
        },
        story: {
          mimeType: "image/png",
          width: 1080,
          height: 1920,
          data: TINY_PNG.toString("base64")
        },
        portraitSvg: {
          mimeType: "image/svg+xml",
          width: 1080,
          height: 1350,
          data: Buffer.from("<svg/>").toString("base64")
        },
        storySvg: {
          mimeType: "image/svg+xml",
          width: 1080,
          height: 1920,
          data: Buffer.from("<svg/>").toString("base64")
        },
        contract
      },
      revision: {
        source: {
          mimeType: "image/png",
          width: 1,
          height: 1,
          data: TINY_PNG.toString("base64")
        },
        portrait: {
          mimeType: "image/png",
          width: 1080,
          height: 1350,
          data: TINY_PNG.toString("base64")
        },
        story: {
          mimeType: "image/png",
          width: 1080,
          height: 1920,
          data: TINY_PNG.toString("base64")
        },
        portraitSvg: {
          mimeType: "image/svg+xml",
          width: 1080,
          height: 1350,
          data: Buffer.from("<svg/>").toString("base64")
        },
        storySvg: {
          mimeType: "image/svg+xml",
          width: 1080,
          height: 1920,
          data: Buffer.from("<svg/>").toString("base64")
        },
        request: { change: "Blue hour", preserve: "Product", allow: "Shadows" },
        contract: {
          schemaVersion: 1,
          kind: "revision",
          brief: (contract as { brief: unknown }).brief,
          selectedDirection: DIRECTIONS.directions[1],
          copy: (contract as { copy: unknown }).copy,
          parentContract: { ...contract, kind: "tampered" },
          revisionRequest: {
            change: "Blue hour",
            preserve: "Product",
            allow: "Shadows"
          }
        }
      }
    };
    const reopened = await runWorkflow(FILES.restore, {
      record_file: documentRef(JSON.stringify(valid))
    });
    try {
      expect(reopened.result.status).toBe("failed");
      expect(reopened.result.error).toMatch(/ancestry/);
      expect(reopened.result.error).not.toMatch(/sequence is/);
      expect((reopened.result.error ?? "").match(/Node "/g)).toHaveLength(1);
      expect(reopened.result.outputs?.accepted_hero).toEqual([]);
    } finally {
      reopened.fake.cleanup();
    }
  });

  it("fails an oversized export without silently dropping artifacts", async () => {
    const fake = createFakeContext({ jobId: "oversized-record" });
    const largeHero = imageRef(new Uint8Array(800));
    const smallPng = imageRef(TINY_PNG, 1080, 1350);
    const storyPng = imageRef(TINY_PNG, 1080, 1920);
    const rawSvg = { data: Buffer.from("<svg/>").toString("base64") };
    try {
      const shippedCode = codeFor(FILES.layouts, "layout-finalize");
      expect(shippedCode).toContain("16 * 1024 * 1024");
      const node = new CodeNode({
        code: shippedCode.replace("16 * 1024 * 1024", "1024"),
        hero: largeHero,
        contract: JSON.stringify(acceptedContract()),
        version: "original",
        original_record: "",
        portrait: smallPng,
        story: storyPng,
        portrait_svg_raw: rawSvg,
        story_svg_raw: rawSvg
      });
      await expect(node.process(fake.context)).rejects.toThrow(
        /exceeds the 16 MiB/
      );
    } finally {
      fake.cleanup();
    }
  }, 30_000);

  it("rejects malformed records before emitting restoration outputs", async () => {
    const reopened = await runWorkflow(FILES.restore, {
      record_file: documentRef("{not json")
    });
    try {
      expect(reopened.result.status).toBe("failed");
      expect(reopened.result.error).toMatch(/malformed JSON/);
      expect(reopened.result.error).not.toMatch(/sequence is/);
      expect((reopened.result.error ?? "").match(/Node "/g)).toHaveLength(1);
      expect(reopened.result.outputs?.accepted_hero).toEqual([]);
      expect(reopened.provider.callCount).toBe(0);
    } finally {
      reopened.fake.cleanup();
    }
  });
});
