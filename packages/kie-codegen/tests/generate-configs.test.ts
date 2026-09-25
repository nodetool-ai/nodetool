import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../src/types.js";

vi.mock("../src/config-writer.js", () => ({
  writeKieConfigs: vi.fn(async () => undefined),
  readKieConfigs: vi.fn(async () => [])
}));

const { generateKieConfigs } = await import("../src/generate-configs.js");

const LLMS = `## API Docs
- Music Models > Suno > Music Generation [Generate Music](https://docs.kie.ai/suno-api/generate-music.md): :::warning Document updated
`;

const NEW_PAGE = `# Generate Music

\`\`\`yaml
openapi: 3.0.1
paths:
  /api/v1/jobs/createTask:
    post:
      operationId: generate-music
      description: >-
        Old version address
        (https://docs.kie.ai/old-model/suno-api/generate-music)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  examples:
                    - ai-music-api/generate
                input:
                  type: object
                  properties:
                    custom_mode:
                      type: boolean
\`\`\`
`;

const LEGACY_PAGE = `# Generate Music

\`\`\`yaml
openapi: 3.0.1
paths:
  /api/v1/generate:
    post:
      operationId: generate-music
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                customMode:
                  type: boolean
\`\`\`
`;

const SHELL = '<!DOCTYPE html><html id="html"><body></body></html>';

function stubDocs(pages: Record<string, string>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const body = pages[String(url)];
      return new Response(body ?? SHELL, { status: 200 });
    })
  );
}

describe("generateKieConfigs", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "kie-generate-"));
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rm(cwd, { recursive: true, force: true });
  });

  it("builds Suno nodes from the legacy page the new page links", async () => {
    stubDocs({
      "https://docs.kie.ai/llms.txt": LLMS,
      "https://docs.kie.ai/suno-api/generate-music.md": NEW_PAGE,
      "https://docs.kie.ai/old-model/suno-api/generate-music.md": LEGACY_PAGE
    });

    const [node] = await generateKieConfigs({ useCache: false, previous: [] });

    expect(node.className).toBe("GenerateMusic");
    expect(node.sunoEndpoint).toBe("/api/v1/generate");
    expect(node.fields.map((field) => field.name)).toEqual(["customMode"]);
  });

  it("keeps the previous config when a docs page cannot be fetched", async () => {
    stubDocs({
      "https://docs.kie.ai/llms.txt": LLMS,
      "https://docs.kie.ai/suno-api/generate-music.md": NEW_PAGE
    });
    const previous: NodeConfig = {
      className: "GenerateMusic",
      modelId: "generate-music",
      title: "Generate Music",
      description: "",
      outputType: "audio",
      useSuno: true,
      sunoEndpoint: "/api/v1/generate",
      fields: []
    };

    const nodes = await generateKieConfigs({
      useCache: false,
      previous: [previous]
    });

    expect(nodes).toEqual([previous]);
  });
});
