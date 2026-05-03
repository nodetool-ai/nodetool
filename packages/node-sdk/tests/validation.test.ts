import { describe, it, expect } from "vitest";
import { BaseNode, type NodeValidationOptions } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import {
  validateNodeProperties,
  formatValidationIssues
} from "../src/validation.js";

const EMPTY_LANGUAGE_MODEL = {
  type: "language_model",
  provider: "empty",
  id: "",
  name: "",
  path: null,
  supported_tasks: []
};

class RequiredFieldNode extends BaseNode {
  static readonly nodeType = "test.RequiredField";
  static readonly title = "Required Field";
  static readonly description = "Has a required text field";

  @prop({ type: "str", default: "", required: true })
  declare text: string;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.text };
  }
}

class ModelFieldNode extends BaseNode {
  static readonly nodeType = "test.ModelField";
  static readonly title = "Model Field";
  static readonly description = "Has a language_model field";

  @prop({
    type: "language_model",
    default: EMPTY_LANGUAGE_MODEL,
    title: "Model"
  })
  declare model: unknown;

  @prop({ type: "str", default: "" })
  declare prompt: string;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class CustomValidationNode extends BaseNode {
  static readonly nodeType = "test.CustomValidation";
  static readonly title = "Custom";
  static readonly description = "Custom validate() override";

  @prop({ type: "int", default: 0 })
  declare min: number;

  @prop({ type: "int", default: 0 })
  declare max: number;

  static validateProperties(
    properties: Record<string, unknown>,
    options: NodeValidationOptions = {}
  ) {
    const issues = super.validateProperties(properties, options);
    const min = Number(properties.min ?? 0);
    const max = Number(properties.max ?? 0);
    if (min > max) {
      issues.push({
        nodeId: options.nodeId,
        nodeType: this.nodeType,
        property: "min",
        message: `min (${min}) must be <= max (${max})`
      });
    }
    return issues;
  }

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

describe("validateNodeProperties — required fields", () => {
  it("flags an unset required string", () => {
    const issues = RequiredFieldNode.validateProperties({ text: "" });
    expect(issues).toHaveLength(1);
    expect(issues[0].property).toBe("text");
    expect(issues[0].message).toMatch(/Required property "text"/);
  });

  it("passes when the required field is set", () => {
    const issues = RequiredFieldNode.validateProperties({ text: "hello" });
    expect(issues).toHaveLength(0);
  });

  it("treats null and undefined as missing", () => {
    expect(
      RequiredFieldNode.validateProperties({ text: null })
    ).toHaveLength(1);
    expect(
      RequiredFieldNode.validateProperties({ text: undefined })
    ).toHaveLength(1);
  });

  it("skips required fields supplied via incoming edge", () => {
    const issues = RequiredFieldNode.validateProperties(
      { text: "" },
      { connectedHandles: new Set(["text"]) }
    );
    expect(issues).toHaveLength(0);
  });

  it("attaches nodeId and nodeType to issues", () => {
    const issues = RequiredFieldNode.validateProperties(
      { text: "" },
      { nodeId: "n1" }
    );
    expect(issues[0].nodeId).toBe("n1");
    expect(issues[0].nodeType).toBe("test.RequiredField");
  });
});

describe("validateNodeProperties — *_model fields", () => {
  it("flags the empty language_model default", () => {
    const issues = ModelFieldNode.validateProperties({
      model: EMPTY_LANGUAGE_MODEL,
      prompt: ""
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].property).toBe("model");
    expect(issues[0].message).toMatch(/language_model/);
  });

  it("flags a model with non-empty provider but missing id", () => {
    const issues = ModelFieldNode.validateProperties({
      model: { type: "language_model", provider: "openai", id: "", name: "" },
      prompt: ""
    });
    expect(issues).toHaveLength(1);
  });

  it("passes for a fully populated model", () => {
    const issues = ModelFieldNode.validateProperties({
      model: {
        type: "language_model",
        provider: "openai",
        id: "gpt-5.4",
        name: "GPT 5.4"
      },
      prompt: ""
    });
    expect(issues).toHaveLength(0);
  });

  it("skips model validation when the field is connected to an edge", () => {
    const issues = ModelFieldNode.validateProperties(
      { model: EMPTY_LANGUAGE_MODEL, prompt: "" },
      { connectedHandles: new Set(["model"]) }
    );
    expect(issues).toHaveLength(0);
  });

  it("instance.validate() proxies to the static validator", () => {
    const node = new ModelFieldNode();
    const issues = node.validate();
    expect(issues.some((i) => i.property === "model")).toBe(true);
  });
});

class RequiredAssetNode extends BaseNode {
  static readonly nodeType = "test.RequiredAsset";
  static readonly title = "Required Asset";
  static readonly description = "Has a required audio + image";

  @prop({
    type: "audio",
    default: { type: "audio", uri: "", asset_id: null, data: null, metadata: null },
    title: "Audio",
    required: true
  })
  declare audio: unknown;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image",
    required: true
  })
  declare image: unknown;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class OptionalAssetNode extends BaseNode {
  static readonly nodeType = "test.OptionalAsset";
  static readonly title = "Optional Asset";
  static readonly description = "Has an optional audio + image";

  @prop({
    type: "audio",
    default: { type: "audio", uri: "", asset_id: null, data: null, metadata: null },
    title: "Audio"
  })
  declare audio: unknown;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image"
  })
  declare image: unknown;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

describe("validateNodeProperties — required asset fields", () => {
  it("flags a required audio with empty uri/asset_id/data", () => {
    const issues = RequiredAssetNode.validateProperties({
      audio: { type: "audio", uri: "", asset_id: null, data: null },
      image: { type: "image", uri: "https://example.com/x.png" }
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].property).toBe("audio");
    expect(issues[0].message).toMatch(/audio/);
  });

  it("passes when uri is set", () => {
    const issues = RequiredAssetNode.validateProperties({
      audio: { type: "audio", uri: "memory://abc" },
      image: { type: "image", uri: "https://example.com/x.png" }
    });
    expect(issues).toHaveLength(0);
  });

  it("passes when asset_id is set", () => {
    const issues = RequiredAssetNode.validateProperties({
      audio: { type: "audio", asset_id: "asset_123" },
      image: { type: "image", uri: "https://example.com/x.png" }
    });
    expect(issues).toHaveLength(0);
  });

  it("passes when inline data is present", () => {
    const issues = RequiredAssetNode.validateProperties({
      audio: { type: "audio", data: "base64..." },
      image: { type: "image", uri: "https://example.com/x.png" }
    });
    expect(issues).toHaveLength(0);
  });

  it("treats null/undefined as unset", () => {
    expect(
      RequiredAssetNode.validateProperties({ audio: null, image: null })
    ).toHaveLength(2);
    expect(
      RequiredAssetNode.validateProperties({
        audio: undefined,
        image: undefined
      })
    ).toHaveLength(2);
  });

  it("skips asset validation when the field is connected", () => {
    const issues = RequiredAssetNode.validateProperties(
      {
        audio: { type: "audio", uri: "" },
        image: { type: "image", uri: "" }
      },
      { connectedHandles: new Set(["audio", "image"]) }
    );
    expect(issues).toHaveLength(0);
  });

  it("does not flag optional asset fields with empty defaults", () => {
    const issues = OptionalAssetNode.validateProperties({
      audio: { type: "audio", uri: "", asset_id: null, data: null },
      image: { type: "image", uri: "", asset_id: null, data: null }
    });
    expect(issues).toHaveLength(0);
  });
});

describe("validateNodeProperties — subclass overrides", () => {
  it("subclasses can layer custom rules over the default validator", () => {
    const issues = CustomValidationNode.validateProperties({
      min: 10,
      max: 1
    });
    expect(issues.some((i) => i.property === "min")).toBe(true);
  });

  it("custom rule does not fire when constraints are satisfied", () => {
    const issues = CustomValidationNode.validateProperties({
      min: 1,
      max: 10
    });
    expect(issues).toHaveLength(0);
  });
});

describe("validateNodeProperties — direct call with declared metadata", () => {
  it("works with hand-constructed metadata", () => {
    const issues = validateNodeProperties(
      [{ name: "x", options: { type: "str", required: true, default: "" } }],
      { x: "" },
      { nodeId: "n1", nodeType: "test.X" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].nodeId).toBe("n1");
  });
});

describe("formatValidationIssues", () => {
  it("formats issues as a readable multi-line message", () => {
    const out = formatValidationIssues([
      {
        nodeId: "a",
        nodeType: "test.A",
        property: "x",
        message: "Required property \"x\" is not set"
      }
    ]);
    expect(out).toMatch(/1 issue/);
    expect(out).toMatch(/test\.A/);
    expect(out).toMatch(/x/);
  });

  it("returns an empty string for no issues", () => {
    expect(formatValidationIssues([])).toBe("");
  });
});
