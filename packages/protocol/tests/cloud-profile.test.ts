import { describe, it, expect } from "vitest";
import {
  CLOUD_NODE_NAMESPACES,
  CLOUD_NODE_ALLOWLIST,
  CLOUD_NODE_DENYLIST,
  CLOUD_HOST_FILE_NODES,
  NON_CLOUD_PROVIDER_IDS,
  CLOUD_BUILTIN_PACK_IDS,
  isCloudNodeType,
  isCloudProvider,
  isCloudProfileActive
} from "../src/cloud-profile.js";
import { BUILTIN_NODE_PACKS } from "../src/builtin-packs.js";

describe("cloud profile activation", () => {
  it("activates for the explicit cloud flag", () => {
    expect(isCloudProfileActive("cloud", undefined)).toBe(true);
    expect(isCloudProfileActive("cloud", "development")).toBe(true);
  });

  it("activates in production mode", () => {
    expect(isCloudProfileActive(undefined, "production")).toBe(true);
    expect(isCloudProfileActive(null, "production")).toBe(true);
  });

  it("stays off otherwise", () => {
    expect(isCloudProfileActive(undefined, undefined)).toBe(false);
    expect(isCloudProfileActive("full", "development")).toBe(false);
    expect(isCloudProfileActive("", "")).toBe(false);
    expect(isCloudProfileActive(null, null)).toBe(false);
  });

  it("lets an explicit full profile override production", () => {
    expect(isCloudProfileActive("full", "production")).toBe(false);
    // Blank/whitespace values don't count as explicit — production default holds.
    expect(isCloudProfileActive("", "production")).toBe(true);
    expect(isCloudProfileActive("  ", "production")).toBe(true);
  });
});

describe("isCloudNodeType", () => {
  it("admits the creative core namespaces", () => {
    for (const nodeType of [
      "nodetool.image.TextToImage",
      "nodetool.audio.synth.Oscillator",
      "nodetool.audio.realtime.AudioOutput",
      "nodetool.video.ImageToVideo",
      "nodetool.model3d.TextTo3D",
      "nodetool.agents.Agent",
      "nodetool.generators.SVGGenerator",
      "lib.image.warp.Offset",
      "lib.audio.Reverb",
      "lib.svg.Document",
      "openai.image.CreateImage",
      "gemini.video.TextToVideo",
      "mistral.text.ChatComplete",
      "xai.image.GenerateImage",
      "fal.image.flux",
      "kie.video.veo"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
  });

  it("rejects the nerdy / out-of-scope namespaces", () => {
    for (const nodeType of [
      "lib.sqlite.GetDatabasePath",
      "lib.pdf.Screenshot",
      "lib.nlp.Tokenize",
      "nodetool.data.Filter",
      "nodetool.document.LoadDocumentFile",
      "nodetool.workspace.ReadTextFile",
      "nodetool.triggers.WebhookTrigger",
      "vector.Collection",
      "messaging.discord.DiscordBotTrigger",
      "huggingface.TextGeneration",
      "transformers.TextGeneration",
      "replicate.something",
      "together.flux",
      "minimax.TextToVideo"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
  });

  it("keeps the standard agents in the allowed namespace", () => {
    expect(isCloudNodeType("nodetool.agents.Agent")).toBe(true);
    expect(isCloudNodeType("nodetool.agents.Summarizer")).toBe(true);
  });

  it("matches namespaces only at segment boundaries", () => {
    expect(isCloudNodeType("lib.imagery.Thing")).toBe(false);
    expect(isCloudNodeType("openairtable.Thing")).toBe(false);
  });
});

describe("code is node-level trimmed; text is whole-listed minus file I/O", () => {
  it("keeps only the sandboxed Code node", () => {
    expect(isCloudNodeType("nodetool.code.Code")).toBe(true);
    // The namespace is not whole-listed, so anything else added under
    // nodetool.code stays out until it is allowlisted by name.
    expect(isCloudNodeType("nodetool.code.Other")).toBe(false);
  });

  it("keeps the whole text toolkit including ASR and utilities", () => {
    for (const nodeType of [
      "nodetool.text.Prompt",
      "nodetool.text.Template",
      "nodetool.text.Concat",
      "nodetool.text.ExtractJSON",
      "nodetool.text.AutomaticSpeechRecognition",
      "nodetool.text.RegexMatch",
      "nodetool.text.ToUppercase",
      "nodetool.text.CountTokens",
      "nodetool.text.Slugify",
      "nodetool.text.Embedding"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
  });

  it("drops the text file-I/O nodes from the managed cloud", () => {
    for (const nodeType of [
      "nodetool.text.LoadTextFolder",
      "nodetool.text.LoadTextAssets",
      "nodetool.text.SaveText",
      "nodetool.text.SaveTextFile"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
  });

  it("drops the host-filesystem nodes from the managed cloud", () => {
    for (const nodeType of CLOUD_HOST_FILE_NODES) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
    // The node users reach for first — a local path picker in the browser.
    expect(CLOUD_HOST_FILE_NODES).toContain(
      "nodetool.input.DocumentFileInput"
    );
  });

  it("keeps the asset-store counterparts of the dropped file nodes", () => {
    // Assets, not host paths, are how the cloud moves files around. Dropping
    // the disk nodes must not take these with them.
    for (const nodeType of [
      "nodetool.input.AssetFolderInput",
      "nodetool.input.DocumentInput",
      "nodetool.image.LoadImageAssets",
      "nodetool.image.SaveImage",
      "nodetool.audio.SaveAudio",
      "nodetool.video.SaveVideo"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
  });

  it("keeps the yt-dlp downloader without its namespace", () => {
    // The cloud image ships yt-dlp on PATH, so the node runs there. Admitting
    // it by name must not drag the rest of the automation surface in with it.
    expect(isCloudNodeType("lib.video.download.YtDlpDownload")).toBe(true);
    expect(isCloudNodeType("lib.video.download.SomethingElse")).toBe(false);
    expect(isCloudNodeType("lib.browser.WebFetch")).toBe(false);
  });

  it("admits every explicit allowlist entry", () => {
    for (const nodeType of CLOUD_NODE_ALLOWLIST) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
  });
});

describe("cloud provider + pack allowlists", () => {
  it("keeps every hosted API — the labs, the aggregators, and the media APIs", () => {
    for (const id of [
      "openai",
      "anthropic",
      "gemini",
      "mistral",
      "xai",
      "groq",
      "openrouter",
      "fal_ai",
      "kie",
      "replicate",
      "together",
      "minimax",
      "elevenlabs",
      "meshy",
      "rodin",
      "topaz",
      "cohere",
      "voyage",
      "deepseek",
      "huggingface"
    ]) {
      expect(isCloudProvider(id)).toBe(true);
    }
  });

  it("drops local engines and the local-CLI subscription", () => {
    for (const id of [
      "ollama",
      "lmstudio",
      "llama_cpp",
      "node_llama_cpp",
      "vllm",
      "transformers_js",
      "claude_agent_sdk"
    ]) {
      expect(isCloudProvider(id)).toBe(false);
    }
  });

  it("treats an unknown provider id as cloud-eligible", () => {
    expect(isCloudProvider("some-future-hosted-api")).toBe(true);
  });

  it("denylisted node types target an allowed namespace and stay out", () => {
    for (const nodeType of CLOUD_NODE_DENYLIST) {
      const ns = CLOUD_NODE_NAMESPACES.find(
        (n) => nodeType === n || nodeType.startsWith(`${n}.`)
      );
      expect(ns).toBeDefined();
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
  });

  it("every cloud pack id exists in the catalog", () => {
    const ids = new Set(BUILTIN_NODE_PACKS.map((p) => p.id));
    for (const id of CLOUD_BUILTIN_PACK_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("non-cloud provider list is non-empty and unique", () => {
    expect(NON_CLOUD_PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(new Set(NON_CLOUD_PROVIDER_IDS).size).toBe(
      NON_CLOUD_PROVIDER_IDS.length
    );
  });
});
