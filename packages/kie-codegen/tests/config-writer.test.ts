import { describe, expect, it } from "vitest";
import {
  buildKieModuleConfigs,
  parseKieConfigModule,
  renderKieConfigModule
} from "../src/config-writer.js";
import type { NodeConfig } from "../src/types.js";

describe("parseKieConfigModule", () => {
  it("reads back what renderKieConfigModule wrote", () => {
    const node: NodeConfig = {
      className: "GenerateMusic",
      modelId: "generate-music",
      title: "Generate Music",
      description: "Lyrics with a }; inside",
      outputType: "audio",
      fields: []
    };
    const config = buildKieModuleConfigs([node]).get("audio")!;

    expect(parseKieConfigModule(renderKieConfigModule(config))).toEqual(config);
  });

  it("rejects a file that is not a generated config module", () => {
    expect(() => parseKieConfigModule("export {};")).toThrow(/Not a generated/);
  });
});
