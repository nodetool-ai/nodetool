import { describe, it, expect } from "vitest";
import {
  CLOUD_NODE_NAMESPACES,
  CLOUD_NODE_ALLOWLIST,
  CLOUD_NODE_DENYLIST,
  CLOUD_PROVIDER_IDS,
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
      "lib.os.ListFiles",
      "lib.sqlite.Query",
      "lib.supabase.Select",
      "lib.http.GetJSON",
      "lib.pdf.ExtractText",
      "lib.docx.CreateDocument",
      "lib.nlp.Tokenize",
      "nodetool.data.Filter",
      "nodetool.document.SplitDocument",
      "nodetool.workspace.ReadTextFile",
      "nodetool.triggers.WebhookTrigger",
      "vector.Collection",
      "search.google.GoogleSearch",
      "apify.scraping.ApifyWebScraper",
      "messaging.discord.DiscordSendMessage",
      "huggingface.TextGeneration",
      "transformers.TextGeneration",
      "replicate.something",
      "together.flux",
      "minimax.TextToVideo"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
  });

  it("applies the denylist inside an allowed namespace", () => {
    expect(isCloudNodeType("nodetool.agents.ShellAgent")).toBe(false);
    expect(isCloudNodeType("nodetool.agents.SQLiteAgent")).toBe(false);
    // …but keeps the creative agents in the same namespace.
    expect(isCloudNodeType("nodetool.agents.ImageAgent")).toBe(true);
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
    for (const nodeType of [
      "nodetool.code.ExecutePython",
      "nodetool.code.ExecuteBash",
      "nodetool.code.ExecuteRuby",
      "nodetool.code.RunPythonCommandDocker",
      "nodetool.code.RunShellCommandDocker"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
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
      "nodetool.text.SaveTextFile"
    ]) {
      expect(isCloudNodeType(nodeType)).toBe(false);
    }
  });

  it("admits every explicit allowlist entry", () => {
    for (const nodeType of CLOUD_NODE_ALLOWLIST) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
  });
});

describe("cloud provider + pack allowlists", () => {
  it("keeps the big labs plus Fal and Kie, drops the rest", () => {
    for (const id of ["openai", "anthropic", "gemini", "mistral", "xai", "groq", "fal_ai", "kie"]) {
      expect(isCloudProvider(id)).toBe(true);
    }
    for (const id of ["replicate", "together", "minimax", "topaz", "cohere", "ollama"]) {
      expect(isCloudProvider(id)).toBe(false);
    }
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

  it("provider allowlist is non-empty and unique", () => {
    expect(CLOUD_PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(new Set(CLOUD_PROVIDER_IDS).size).toBe(CLOUD_PROVIDER_IDS.length);
  });
});
